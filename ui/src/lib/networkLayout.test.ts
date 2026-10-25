import { describe, expect, it } from 'vitest';
import fixture from '../../data/synthetic/merch-launch.json';
import type { Run } from '../model/types.ts';
import { networkLayout } from './networkLayout.ts';

const monitored = fixture.runs.find((r) => r.id === 'monitored')! as Run;

describe('skeleton-constrained agent layout', () => {
  it('keeps shared actors in exactly the same place with or without the Judge', () => {
    const a = networkLayout(monitored);
    const b = networkLayout(fixture.runs.find((r) => r.id === 'planted')! as Run);
    for (const actor of monitored.actors.filter((a) => a.kind === 'agent')) expect(a.points.get(`actor:${actor.id}`)).toEqual(b.points.get(`actor:${actor.id}`));
    expect(a.points.get('actor:judge')).toEqual(b.points.get('seat'));
  });

  it('is unaffected by event order, rewind or input array order', () => {
    const shuffled = { ...monitored, actors: [...monitored.actors].reverse(), records: [...monitored.records].reverse(), events: [] };
    expect(networkLayout(shuffled)).toEqual(networkLayout(monitored));
  });

  for (const size of [1, 4, 12, 24, 50]) it(`keeps ${size} agents separated inside the central region`, () => {
    const run: Run = { ...monitored, actors: [monitored.actors.find((a) => a.kind === 'monitor')!, ...Array.from({ length: size }, (_, i) => ({ ...monitored.actors[0], id: `agent-${i + 1}` }))] };
    const { points, width, height, agentTop, agentBottom } = networkLayout(run);
    const agents = run.actors.filter((a) => a.kind === 'agent').map((a) => points.get(`actor:${a.id}`)!);
    for (let i = 0; i < agents.length; i++) {
      const p = agents[i];
      expect(p.x).toBeGreaterThan(250);
      expect(p.x).toBeLessThan(width - 250);
      expect(p.y).toBeGreaterThan(agentTop);
      expect(p.y + 70).toBeLessThan(agentBottom);
      for (let j = i + 1; j < agents.length; j++) expect(Math.abs(p.x - agents[j].x) >= 140 || Math.abs(p.y - agents[j].y) >= 120).toBe(true);
    }
    expect(points.get('record:sandbox')!.x).toBeLessThan(Math.min(...agents.map((p) => p.x)));
    expect(points.get('record:honeypot')!.x).toBeGreaterThan(Math.max(...agents.map((p) => p.x)));
    expect(points.get('actor:judge')!.y).toBeGreaterThan(agentBottom);
    expect(points.get('actor:judge')!.y + 70).toBeLessThan(height);
  });

  it('adds source rows and destination space instead of overlapping large record sets', () => {
    const records = [...Array.from({ length: 12 }, (_, i) => ({ ...monitored.records[0], id: `source-${i}` })), ...Array.from({ length: 4 }, (_, i) => ({ ...monitored.records.find((r) => r.kind === 'sandbox')!, id: `sandbox-${i}` }))];
    const { points, agentTop, width } = networkLayout({ ...monitored, records });
    for (const record of records) {
      const p = points.get(`record:${record.id}`)!;
      expect(p.x).toBeGreaterThan(70); expect(p.x).toBeLessThan(width - 70);
      if (record.kind !== 'sandbox') expect(p.y + 40).toBeLessThan(agentTop);
    }
    const gates = records.filter((r) => r.kind === 'sandbox').map((r) => points.get(`record:${r.id}`)!);
    for (let i = 1; i < gates.length; i++) expect(Math.abs(gates[i].y - gates[i - 1].y)).toBeGreaterThanOrEqual(190);
  });
});
