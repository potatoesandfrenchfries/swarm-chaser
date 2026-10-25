import type { ClaimStatus, ReplayEvent, Run, Verdict } from './types.ts';

/**
 * Deterministic replay. The state at cursor k is a pure fold over events[0..k]; cursor -1 is the
 * moment before the first event. Seeking to the same k always gives the same state, whatever was
 * shown before. Views render this; animation only decorates the transition into `current`.
 */

export type Channel =
  | 'read' // actor read a record
  | 'task' // delegation that carries no claim
  | 'claim' // the claim is stated, repeated, endorsed or carried in a task
  | 'dispute'
  | 'action' // an action unrelated to any claim
  | 'claim-action' // an action taken on the claim
  | 'corrective-action' // an action that follows a correction or intervention
  | 'check'
  | 'intervene'
  | 'correct'
  | 'submit' // an agent asks Chaser to carry out an action
  | 'allow' // Chaser lets it through to the sandbox
  | 'divert'; // Chaser sends it to the honeypot

export interface NodeRef {
  kind: 'actor' | 'record';
  id: string;
}

export interface EdgeState {
  key: string;
  from: NodeRef;
  to: NodeRef;
  channel: Channel;
  events: string[];
  lastSeq: number;
}

export interface ActorState {
  /** Claims this actor received or read. Exposure, not belief. */
  exposed: string[];
  /** Claims this actor stated or passed on. */
  said: string[];
  /** Claims this actor took an action on. */
  acted: string[];
  /** Claims this actor was told were wrong (intervention or correction). */
  corrected: string[];
  /** Claims this actor checked. */
  checked: string[];
  lastEvent: string | null;
}

export interface RecordState {
  touched: boolean;
  /** Last effect written by an action, verbatim. Null until an action changes it. */
  state: string | null;
  changedBy: string | null;
  lastChange: 'claim' | 'corrective' | 'other' | 'allowed' | 'diverted' | null;
  /** Verdicts reached against this record so far. */
  verdicts: { claim: string; verdict: Verdict; event: string }[];
  /** Every effect written to it so far, oldest first (a sandbox collects many). */
  effects: { event: string; text: string; change: NonNullable<RecordState['lastChange']> }[];
}

export interface ClaimState {
  stated: boolean;
  status: ClaimStatus;
  statusEvent: string | null;
  carriers: string[];
  actions: string[];
  interventions: string[];
  corrections: string[];
}

export interface ReplayState {
  cursor: number;
  current: ReplayEvent | null;
  applied: ReplayEvent[];
  actors: Record<string, ActorState>;
  records: Record<string, RecordState>;
  claims: Record<string, ClaimState>;
  edges: EdgeState[];
}

export const CARRIES = new Set(['claim', 'repeat', 'endorse', 'delegate']);

/** An event passes a claim on when it states, repeats, endorses or delegates with it. */
export function carriesClaim(e: ReplayEvent): boolean {
  return e.claim !== null && CARRIES.has(e.type);
}

/** An action that directly follows a correction or an intervention. */
export function isCorrective(e: ReplayEvent, byId: Map<string, ReplayEvent>): boolean {
  return e.causes.some((c) => {
    const t = byId.get(c)?.type;
    return t === 'correct' || t === 'intervene';
  });
}

export function channelOf(e: ReplayEvent, byId: Map<string, ReplayEvent>): Channel {
  switch (e.type) {
    case 'read':
      return 'read';
    case 'delegate':
      return e.claim ? 'claim' : 'task';
    case 'claim':
    case 'repeat':
    case 'endorse':
      return 'claim';
    case 'dispute':
      return 'dispute';
    case 'action':
      if (isCorrective(e, byId)) return 'corrective-action';
      return e.claim ? 'claim-action' : 'action';
    case 'check':
      return 'check';
    case 'intervene':
      return 'intervene';
    case 'correct':
      return 'correct';
    case 'submit':
      return 'submit';
    case 'allow':
      return 'allow';
    case 'divert':
      return 'divert';
  }
}

/** Events whose effect lands on a record: an agent's own action, or Chaser passing one on. */
export function writesRecord(e: ReplayEvent): boolean {
  return e.type === 'action' || e.type === 'allow' || e.type === 'divert';
}

export function clampCursor(run: Run, cursor: number): number {
  if (!Number.isFinite(cursor)) return -1;
  return Math.max(-1, Math.min(run.events.length - 1, Math.trunc(cursor)));
}

function add(list: string[], id: string) {
  if (!list.includes(id)) list.push(id);
}

export function deriveState(run: Run, cursorIn: number): ReplayState {
  const cursor = clampCursor(run, cursorIn);
  const byId = new Map(run.events.map((e) => [e.id, e]));
  const actors: Record<string, ActorState> = {};
  for (const a of run.actors) actors[a.id] = { exposed: [], said: [], acted: [], corrected: [], checked: [], lastEvent: null };
  const records: Record<string, RecordState> = {};
  for (const r of run.records) records[r.id] = { touched: false, state: null, changedBy: null, lastChange: null, verdicts: [], effects: [] };
  const claims: Record<string, ClaimState> = {};
  for (const c of run.claims) {
    claims[c.id] = { stated: false, status: 'unchecked', statusEvent: null, carriers: [], actions: [], interventions: [], corrections: [] };
  }
  const edges = new Map<string, EdgeState>();
  const applied = run.events.slice(0, cursor + 1);

  for (const e of applied) {
    const actor = actors[e.actor];
    actor.lastEvent = e.id;
    const targetActor = e.target?.kind === 'actor' ? actors[e.target.id] : undefined;
    const targetRecord = e.target?.kind === 'record' ? records[e.target.id] : undefined;
    if (targetRecord) targetRecord.touched = true;
    const claim = e.claim ? claims[e.claim] : undefined;

    if (e.claim && claim) {
      if (carriesClaim(e)) {
        claim.stated = true;
        add(claim.carriers, e.id);
        add(actor.said, e.claim);
        if (targetActor) add(targetActor.exposed, e.claim);
      }
      if (e.type === 'read') add(actor.exposed, e.claim);
      if ((e.type === 'action' && !isCorrective(e, byId)) || e.type === 'submit') {
        add(claim.actions, e.id);
        add(actor.acted, e.claim);
      }
      if (e.type === 'check' && e.verdict) {
        claim.status = e.verdict;
        claim.statusEvent = e.id;
        add(actor.checked, e.claim);
        if (targetRecord) targetRecord.verdicts.push({ claim: e.claim, verdict: e.verdict, event: e.id });
      }
      if (e.type === 'intervene') {
        add(claim.interventions, e.id);
        if (targetActor) add(targetActor.corrected, e.claim);
      }
      if (e.type === 'correct' || e.type === 'dispute') {
        add(claim.corrections, e.id);
        if (targetActor) add(targetActor.corrected, e.claim);
      }
    }

    if (writesRecord(e) && targetRecord) {
      targetRecord.state = e.effect;
      targetRecord.changedBy = e.id;
      targetRecord.lastChange =
        e.type === 'divert' ? 'diverted' : e.type === 'allow' ? 'allowed' : isCorrective(e, byId) ? 'corrective' : e.claim ? 'claim' : 'other';
      if (e.effect !== null) targetRecord.effects.push({ event: e.id, text: e.effect, change: targetRecord.lastChange });
    }

    if (e.target) {
      // Lines follow the information: a read flows from what is read to the reader.
      const actorRef: NodeRef = { kind: 'actor', id: e.actor };
      const targetRef: NodeRef = { kind: e.target.kind, id: e.target.id };
      const [from, to] = e.type === 'read' ? [targetRef, actorRef] : [actorRef, targetRef];
      const channel = channelOf(e, byId);
      const key = `${from.kind}:${from.id}>${to.kind}:${to.id}#${channel}`;
      const edge = edges.get(key) ?? { key, from, to, channel, events: [], lastSeq: -1 };
      edge.events.push(e.id);
      edge.lastSeq = e.seq;
      edges.set(key, edge);
    }
  }

  return {
    cursor,
    current: cursor >= 0 ? run.events[cursor] : null,
    applied,
    actors,
    records,
    claims,
    edges: [...edges.values()].sort((a, b) => a.lastSeq - b.lastSeq || a.key.localeCompare(b.key)),
  };
}

/** Events that list `eventId` among their causes, anywhere in the run (the replay view filters by cursor). */
export function downstreamOf(run: Run, eventId: string): ReplayEvent[] {
  return run.events.filter((e) => e.causes.includes(eventId));
}

/** All events `eventId` depends on, transitively, in run order. */
export function upstreamOf(run: Run, eventId: string): ReplayEvent[] {
  const byId = new Map(run.events.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const stack = [...(byId.get(eventId)?.causes ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(byId.get(id)?.causes ?? []));
  }
  return run.events.filter((e) => seen.has(e.id));
}
