import { channelOf } from './replay.ts';
import type { Bundle, Run } from './types.ts';

/**
 * The property-graph projection of a run: what the Neo4j loader writes and what the explorer draws
 * when Neo4j is offline. One function, so the database and the fallback can never disagree.
 *
 *   (:Actor)-[:DID]->(:Event)-[:TO]->(:Actor)       an event directed at an actor
 *   (:Event)-[:ON]->(:Record)                       an event directed at a record (read, action, check)
 *   (:Event)-[:ABOUT]->(:Claim)                     the claim an event states, carries, checks or corrects
 *   (:Event)-[:CITES {stance}]->(:Record)           evidence quoted by a check or intervention
 *   (:Event)-[:DEPENDS_ON]->(:Event)                a cause recorded in the log (reply, task, read)
 *   (:Claim)-[:FIRST_STATED_IN]->(:Event)
 */

export type NodeLabel = 'Actor' | 'Record' | 'Claim' | 'Event';
export type RelType = 'DID' | 'TO' | 'ON' | 'ABOUT' | 'CITES' | 'DEPENDS_ON' | 'FIRST_STATED_IN';
export const REL_TYPES: RelType[] = ['DID', 'TO', 'ON', 'ABOUT', 'CITES', 'DEPENDS_ON', 'FIRST_STATED_IN'];

type Scalar = string | number | boolean | null;

export interface GNode {
  /** Unique across bundles: bundle/run/id. */
  key: string;
  id: string;
  label: NodeLabel;
  name: string;
  /** Event order for events; null for the rest. */
  seq: number | null;
  props: Record<string, Scalar>;
}

export interface GEdge {
  key: string;
  type: RelType;
  from: string;
  to: string;
  props: Record<string, Scalar>;
}

export interface Projection {
  bundle: string;
  run: string;
  provenance: string;
  nodes: GNode[];
  edges: GEdge[];
}

export function nodeKey(bundle: string, run: string, id: string) {
  return `${bundle}/${run}/${id}`;
}

export function projectRun(bundle: Pick<Bundle, 'id' | 'provenance'>, run: Run): Projection {
  const k = (id: string) => nodeKey(bundle.id, run.id, id);
  const byId = new Map(run.events.map((e) => [e.id, e]));
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const edge = (type: RelType, from: string, to: string, props: Record<string, Scalar> = {}) =>
    edges.push({ key: `${from}-${type}-${to}`, type, from, to, props });

  for (const a of run.actors) {
    nodes.push({ key: k(a.id), id: a.id, label: 'Actor', name: a.name, seq: null, props: { kind: a.kind, model: a.model, role: a.role } });
  }
  for (const r of run.records) {
    nodes.push({
      key: k(r.id),
      id: r.id,
      label: 'Record',
      name: r.label,
      seq: null,
      props: { kind: r.kind, planted: r.planted, content: r.content, source_file: r.source?.file ?? null, source_ref: r.source?.ref ?? null },
    });
  }
  for (const c of run.claims) {
    nodes.push({ key: k(c.id), id: c.id, label: 'Claim', name: c.id, seq: byId.get(c.origin)?.seq ?? null, props: { text: c.text, ground_truth: c.ground_truth } });
    edge('FIRST_STATED_IN', k(c.id), k(c.origin));
  }
  for (const e of run.events) {
    nodes.push({
      key: k(e.id),
      id: e.id,
      label: 'Event',
      name: `${e.seq + 1} ${e.type}`,
      seq: e.seq,
      props: {
        type: e.type,
        channel: channelOf(e, byId),
        ts: e.ts,
        order_basis: e.order_basis,
        text: e.text,
        summary: e.summary,
        tool: e.tool ? JSON.stringify(e.tool) : null,
        effect: e.effect,
        verdict: e.verdict,
        basis: e.basis,
        source_file: e.source?.file ?? null,
        source_ref: e.source?.ref ?? null,
      },
    });
    edge('DID', k(e.actor), k(e.id));
    if (e.target) edge(e.target.kind === 'actor' ? 'TO' : 'ON', k(e.id), k(e.target.id));
    if (e.claim) edge('ABOUT', k(e.id), k(e.claim));
    for (const q of e.evidence) edge('CITES', k(e.id), k(q.record), { stance: q.stance, quote: q.quote });
    for (const c of e.causes) edge('DEPENDS_ON', k(e.id), k(c));
  }
  return { bundle: bundle.id, run: run.id, provenance: bundle.provenance, nodes, edges };
}

