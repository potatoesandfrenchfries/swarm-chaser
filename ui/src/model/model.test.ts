import { describe, expect, it } from 'vitest';
import bundleJson from '../../data/synthetic/merch-launch.json';
import { projectRun, projectionAt } from './graph.ts';
import { claimMetrics } from './metrics.ts';
import { clampCursor, deriveState, downstreamOf, upstreamOf } from './replay.ts';
import type { Bundle, Run } from './types.ts';
import { validateBundle } from './validate.ts';

const bundle = bundleJson as Bundle;
const run = (id: string): Run => bundle.runs.find((r) => r.id === id)!;
const clone = (): Bundle => structuredClone(bundle);

describe('validateBundle', () => {
  it('accepts the synthetic demonstration bundle', () => {
    expect(validateBundle(bundle)).toEqual([]);
  });

  it('rejects an evidence quote that is not verbatim in its record', () => {
    const b = clone();
    b.runs[2].events[8].evidence[0].quote = 'TS-01 shirts on hand: 400';
    expect(validateBundle(b).join('\n')).toMatch(/not in Stock sheet/);
  });

  it('rejects a claim whose text is not verbatim in its origin event', () => {
    const b = clone();
    b.runs[1].claims[0].text = 'The supplier has 200 shirts.';
    expect(validateBundle(b).join('\n')).toMatch(/not verbatim/);
  });

  it('rejects a cause that does not come earlier', () => {
    const b = clone();
    b.runs[2].events[3].causes = ['m-e05'];
    expect(validateBundle(b).join('\n')).toMatch(/does not come before/);
  });

  it('rejects a recorded run hidden inside a synthetic bundle', () => {
    const b = clone();
    b.runs[0].provenance = 'recorded';
    expect(validateBundle(b).join('\n')).toMatch(/recorded inside a synthetic bundle/);
  });

  it('rejects gaps in the event order', () => {
    const b = clone();
    b.runs[0].events.splice(2, 1);
    expect(validateBundle(b).length).toBeGreaterThan(0);
  });
});

describe('deriveState', () => {
  const m = run('monitored');

  it('is the empty state before the first event', () => {
    const s = deriveState(m, -1);
    expect(s.current).toBeNull();
    expect(s.edges).toEqual([]);
    expect(s.actors['agent-2'].exposed).toEqual([]);
  });

  it('separates exposure, repetition and action', () => {
    const s = deriveState(m, 6);
    expect(s.actors['agent-3'].exposed).toEqual(['C1']);
    expect(s.actors['agent-3'].said).toEqual([]);
    expect(s.actors['agent-3'].acted).toEqual(['C1']);
    expect(s.actors['agent-2'].said).toEqual(['C1']);
    expect(s.actors['agent-1'].exposed).toEqual(['C1']); // read the planted note
    expect(s.claims.C1.status).toBe('unchecked');
    expect(s.records.listing.state).toBe('TS-01 preorder open, quantity 200');
  });

  it('records the verdict at the check and the correction after it', () => {
    expect(deriveState(m, 7).claims.C1.status).toBe('unchecked');
    const atCheck = deriveState(m, 8);
    expect(atCheck.claims.C1.status).toBe('contradicted');
    expect(atCheck.records.stock.verdicts).toEqual([{ claim: 'C1', verdict: 'contradicted', event: 'm-e08' }]);
    const end = deriveState(m, m.events.length - 1);
    expect(end.records.listing.state).toBe('TS-01 preorder open, quantity 40');
    expect(end.records.listing.lastChange).toBe('corrective');
    expect(end.actors['agent-3'].corrected).toEqual(['C1']);
  });

  it('gives the same state whichever way the cursor arrived', () => {
    const forward = deriveState(m, 9);
    deriveState(m, 14);
    deriveState(m, 2);
    expect(deriveState(m, 9)).toEqual(forward);
  });

  it('rewinding removes later effects', () => {
    const s = deriveState(m, 3);
    expect(s.records.listing.state).toBeNull();
    expect(s.actors['agent-3'].acted).toEqual([]);
    expect(s.edges.every((e) => e.lastSeq <= 3)).toBe(true);
  });

  it('clamps out-of-range cursors', () => {
    expect(clampCursor(m, 999)).toBe(m.events.length - 1);
    expect(clampCursor(m, -5)).toBe(-1);
    expect(clampCursor(m, Number.NaN)).toBe(-1);
  });

  it('gives edges a direction and a channel per meaning', () => {
    const s = deriveState(m, m.events.length - 1);
    const channel = (key: string) => s.edges.find((e) => e.key === key)?.channel;
    expect(channel('actor:agent-1>actor:agent-2#claim')).toBe('claim');
    expect(channel('actor:agent-3>record:listing#claim-action')).toBe('claim-action');
    expect(channel('actor:agent-3>record:listing#corrective-action')).toBe('corrective-action');
    expect(channel('actor:judge>record:stock#check')).toBe('check');
    expect(channel('actor:agent-2>actor:agent-3#correct')).toBe('correct');
    expect(s.edges.find((e) => e.key.startsWith('actor:agent-2>actor:agent-1'))?.channel).toBe('task');
  });
});

describe('causal links', () => {
  const m = run('monitored');
  it('follows causes upstream and downstream', () => {
    expect(upstreamOf(m, 'm-e04').map((e) => e.id)).toEqual(['m-e00', 'm-e01', 'm-e02', 'm-e03']);
    expect(downstreamOf(m, 'm-e02').map((e) => e.id)).toEqual(['m-e03', 'm-e05']);
  });
});

describe('claimMetrics', () => {
  it('counts nothing for the planted claim in the baseline, where it is absent by design', () => {
    const b = claimMetrics(run('baseline'), 'C1');
    expect(b.present).toBe(false);
    expect(b.exposed).toEqual([]);
    expect(b.finalStates.listing).toBe('TS-01 preorder open, quantity 40');
  });

  it('counts the planted run', () => {
    const p = claimMetrics(run('planted'), 'C1');
    expect(p.exposed).toEqual(['agent-1', 'agent-2', 'agent-3', 'agent-4']);
    expect(p.repetitions).toEqual(['p-e03', 'p-e05', 'p-e07']);
    expect(p.actions).toEqual(['p-e04', 'p-e06']);
    expect(p.checks).toEqual([]);
    expect(p.detectionDistance).toBeNull();
  });

  it('counts the monitored run, including detection distance and corrective actions', () => {
    const m = claimMetrics(run('monitored'), 'C1');
    expect(m.exposed).toHaveLength(4);
    expect(m.repetitions).toEqual(['m-e03', 'm-e05']);
    expect(m.actions).toEqual(['m-e04', 'm-e06']);
    expect(m.checks).toEqual([{ event: 'm-e08', verdict: 'contradicted' }]);
    expect(m.detectionDistance).toBe(6);
    expect(m.interventions).toEqual(['m-e09']);
    expect(m.corrections).toEqual(['m-e11', 'm-e13']);
    expect(m.correctiveActions).toEqual(['m-e12', 'm-e14']);
    expect(m.finalStates.listing).toBe('TS-01 preorder open, quantity 40');
  });

  it('counts only up to the cursor when asked', () => {
    expect(claimMetrics(run('monitored'), 'C1', 4).actions).toEqual(['m-e04']);
  });
});

describe('projectRun', () => {
  const p = projectRun(bundle, run('monitored'));
  it('keys every node uniquely and every edge to existing nodes', () => {
    const keys = new Set(p.nodes.map((n) => n.key));
    expect(keys.size).toBe(p.nodes.length);
    expect(p.edges.every((e) => keys.has(e.from) && keys.has(e.to))).toBe(true);
  });
  it('drops future events at a cursor but keeps actors and records', () => {
    const at = projectionAt(p, 2);
    expect(at.nodes.filter((n) => n.label === 'Event').map((n) => n.id)).toEqual(['m-e00', 'm-e01', 'm-e02']);
    expect(at.nodes.filter((n) => n.label === 'Actor')).toHaveLength(5);
    expect(at.edges.some((e) => e.type === 'DEPENDS_ON' && e.from.endsWith('m-e02'))).toBe(true);
  });
});
