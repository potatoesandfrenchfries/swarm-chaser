import type { Run } from '../model/types.ts';

export interface NetworkPoint { x: number; y: number; }
export interface NetworkLayout {
  width: number;
  height: number;
  agentTop: number;
  agentBottom: number;
  points: Map<string, NetworkPoint>;
}

/** Fixed destination lanes and an ID-sorted grid, independent of event order and replay cursor.
 * Extra actors/records add rows; they never collide or trigger a force simulation during playback.
 */
export function networkLayout(run: Run): NetworkLayout {
  const sorted = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const agents = sorted(run.actors.filter((a) => a.kind === 'agent'));
  const monitors = sorted(run.actors.filter((a) => a.kind !== 'agent'));
  const sources = sorted(run.records.filter((r) => !['sandbox', 'honeypot'].includes(r.kind)));
  const columns = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(agents.length))));
  const width = Math.max(800, 440 + columns * 150, monitors.length * 145 + 180);
  const sourceColumns = Math.max(2, Math.floor((width - 410) / 150));
  const sourceRows = Math.ceil(sources.length / sourceColumns);
  const agentTop = 24 + sourceRows * 100;
  const rows = Math.max(1, Math.ceil(agents.length / columns));
  const gateCount = Math.max(...['sandbox', 'honeypot'].map((kind) => run.records.filter((r) => r.kind === kind).length));
  const agentBottom = agentTop + Math.max(rows * 150, gateCount * 190);
  const height = agentBottom + 145;
  const points = new Map<string, NetworkPoint>();
  agents.forEach((a, i) => points.set(`actor:${a.id}`, {
    x: width / 2 + (i % columns - (columns - 1) / 2) * 150,
    y: agentTop + 45 + Math.floor(i / columns) * 150,
  }));
  monitors.forEach((a, i) => points.set(`actor:${a.id}`, { x: width / 2 + (i - (monitors.length - 1) / 2) * 145, y: agentBottom + 65 }));
  points.set('seat', { x: width / 2, y: agentBottom + 65 });
  sources.forEach((r, i) => points.set(`record:${r.id}`, {
    x: width / 2 + (i % sourceColumns - (sourceColumns - 1) / 2) * 150,
    y: 66 + Math.floor(i / sourceColumns) * 100,
  }));
  for (const kind of ['sandbox', 'honeypot']) {
    const gates = sorted(run.records.filter((r) => r.kind === kind));
    gates.forEach((r, i) => points.set(`record:${r.id}`, { x: kind === 'sandbox' ? 95 : width - 95, y: agentTop + (i + .5) * ((agentBottom - agentTop) / gates.length) }));
  }
  return { width, height, agentTop, agentBottom, points };
}
