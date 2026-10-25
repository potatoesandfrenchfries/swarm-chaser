import { describe, expect, it } from 'vitest';
import fixture from '../../data/synthetic/merch-launch.json';
import { deriveState } from '../model/replay.ts';
import type { Run } from '../model/types.ts';
import { networkLayout } from './networkLayout.ts';
import { createNetworkRouter } from './networkRoutes.ts';

const run = fixture.runs.find((r) => r.id === 'monitored')! as Run;
describe('structured network routes', () => {
  it('routes every fixture relationship through orthogonal corridors, without crossing other nodes', () => {
    const layout = networkLayout(run), route = createNetworkRouter(run, layout);
    const edges = deriveState(run, run.events.length - 1).edges;
    for (const edge of edges) {
      const { d, points } = route(edge.from, edge.to);
      expect(d, edge.key).not.toBe('');
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        expect(a.x === b.x || a.y === b.y, edge.key).toBe(true);
        for (const actor of run.actors) {
          const node = layout.points.get(`actor:${actor.id}`)!;
          // The path can meet its own terminal, but cannot pass back through that actor's disc.
          for (let t = .1; t < 1; t += .1) {
            const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
            expect(Math.abs(x - node.x) < 28 && Math.abs(y - node.y) < 28, `${edge.key} crosses ${actor.id}`).toBe(false);
          }
        }
      }
      expect(route(edge.from, edge.to)).toEqual({ d, points });
    }
  });
  it('uses the same routing geometry after seeking or rearranging source arrays', () => {
    const layout = networkLayout(run), route = createNetworkRouter(run, layout);
    const other = createNetworkRouter({ ...run, actors: [...run.actors].reverse(), events: [] }, networkLayout(run));
    for (const edge of deriveState(run, run.events.length - 1).edges) expect(route(edge.from, edge.to)).toEqual(other(edge.from, edge.to));
  });
});
