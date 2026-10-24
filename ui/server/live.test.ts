import { describe, expect, it } from 'vitest';
import bundleJson from '../data/synthetic/merch-launch.json';
import type { Bundle } from '../src/model/types.ts';
import { parseLive } from './live.ts';

const run = (bundleJson as Bundle).runs.find((r) => r.id === 'monitored')!;
const { events, ...rest } = run;
const header = JSON.stringify({ type: 'header', schema: 'claim-spread/live@1', title: 'Test', provenance: 'synthetic', run: rest });
const line = (i: number) => JSON.stringify({ type: 'event', event: events[i] });

describe('parseLive', () => {
  it('builds a growing run from a header and event lines, keeping the declared provenance', () => {
    const p = parseLive([header, line(0), line(1), line(2)].join('\n'), 'test');
    expect(p.problems).toEqual([]);
    expect(p.bundle?.provenance).toBe('synthetic');
    expect(p.bundle?.runs[0].events.map((e) => e.id)).toEqual(['m-e00', 'm-e01', 'm-e02']);
  });

  it('accepts a claim declared before the step that first states it', () => {
    // C1 is declared in the header; its origin m-e02 has not streamed yet.
    expect(parseLive([header, line(0), line(1)].join('\n'), 'test').problems).toEqual([]);
  });

  it('refuses a step that arrives out of order, and keeps the rest', () => {
    const p = parseLive([header, line(0), line(2), line(1)].join('\n'), 'test');
    expect(p.problems[0]).toMatch(/Line 3 refused/);
    expect(p.bundle?.runs[0].events.map((e) => e.id)).toEqual(['m-e00', 'm-e01']);
  });

  it('refuses a line whose item is not nested under its type', () => {
    const p = parseLive([header, JSON.stringify({ type: 'event', ...events[0] })].join('\n'), 'test');
    expect(p.problems[0]).toMatch(/should look like/);
    expect(p.bundle?.runs[0].events).toEqual([]);
  });

  it('waits for a last line that is still being written', () => {
    const p = parseLive([header, line(0), line(1).slice(0, 40)].join('\n'), 'test');
    expect(p.problems).toEqual([]);
    expect(p.bundle?.runs[0].events).toHaveLength(1);
  });

  it('labels a stream without provenance as live, never as synthetic', () => {
    const h = JSON.stringify({ type: 'header', title: 'Real', run: rest });
    expect(parseLive(h, 'x').bundle?.provenance).toBe('live');
  });
});
