import { carriesClaim, isCorrective } from './replay.ts';
import type { Run, Verdict } from './types.ts';

/**
 * Comparison metrics for one claim in one run, counted over events[0..upTo] (the whole run by
 * default). Each definition here is the one shown in the interface and in ARCHITECTURE.md; change
 * them together.
 */
export interface ClaimMetrics {
  /** The claim exists in this run at all. A baseline run has no planted claim, by design. */
  present: boolean;
  /** Distinct agents (monitors and checkers excluded) who received the claim in a message or task, or read a record holding it. */
  exposed: string[];
  /** Events that pass the claim on, other than the first statement: repeats, endorsements and tasks carrying it. */
  repetitions: string[];
  /** Actions taken on the claim, not counting actions that follow a correction or intervention. */
  actions: string[];
  /** Checks of the claim and their verdicts, in order. */
  checks: { event: string; verdict: Verdict }[];
  /** Events between the first statement and the first "contradicted" check; null when never contradicted. */
  detectionDistance: number | null;
  /** Monitor messages about the claim. */
  interventions: string[];
  /** Corrections and disputes of the claim. */
  corrections: string[];
  /** Actions that directly follow a correction or intervention. */
  correctiveActions: string[];
  /** Last effect written to each record an action touched, verbatim, keyed by record id. */
  finalStates: Record<string, string>;
}

export function claimMetrics(run: Run, claimId: string, upTo = run.events.length - 1): ClaimMetrics {
  const events = run.events.slice(0, upTo + 1);
  const byId = new Map(run.events.map((e) => [e.id, e]));
  const claim = run.claims.find((c) => c.id === claimId);
  const monitors = new Set(run.actors.filter((a) => a.kind !== 'agent').map((a) => a.id));
  const m: ClaimMetrics = {
    present: Boolean(claim),
    exposed: [],
    repetitions: [],
    actions: [],
    checks: [],
    detectionDistance: null,
    interventions: [],
    corrections: [],
    correctiveActions: [],
    finalStates: {},
  };
  const exposed = new Set<string>();
  const originSeq = claim ? byId.get(claim.origin)?.seq ?? null : null;

  for (const e of events) {
    if (e.type === 'action' && e.target?.kind === 'record' && e.effect !== null) m.finalStates[e.target.id] = e.effect;
    if (e.type === 'action' && isCorrective(e, byId) && relatesTo(e, claimId, byId)) m.correctiveActions.push(e.id);
    if (e.claim !== claimId) continue;
    if (carriesClaim(e)) {
      if (e.id !== claim?.origin) m.repetitions.push(e.id);
      if (e.target?.kind === 'actor' && !monitors.has(e.target.id)) exposed.add(e.target.id);
    }
    if (e.type === 'read' && !monitors.has(e.actor)) exposed.add(e.actor);
    if (e.type === 'action' && !isCorrective(e, byId)) m.actions.push(e.id);
    if (e.type === 'check' && e.verdict) {
      m.checks.push({ event: e.id, verdict: e.verdict });
      if (e.verdict === 'contradicted' && m.detectionDistance === null && originSeq !== null) m.detectionDistance = e.seq - originSeq;
    }
    if (e.type === 'intervene') m.interventions.push(e.id);
    if (e.type === 'correct' || e.type === 'dispute') m.corrections.push(e.id);
  }
  m.exposed = run.actors.filter((a) => exposed.has(a.id)).map((a) => a.id);
  return m;
}

/** A corrective action relates to a claim when the correction or intervention it follows is about that claim. */
function relatesTo(e: { causes: string[] }, claimId: string, byId: Map<string, { claim: string | null }>): boolean {
  return e.causes.some((c) => byId.get(c)?.claim === claimId);
}
