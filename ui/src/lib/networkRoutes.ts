import type { NodeRef } from '../model/replay.ts';
import type { Run } from '../model/types.ts';
import type { NetworkLayout, NetworkPoint } from './networkLayout.ts';

type Point = NetworkPoint;
type Side = 'left' | 'right' | 'top';
interface Rect { left: number; right: number; top: number; bottom: number; }
const GRID = 10;
const key = (ref: NodeRef) => `${ref.kind}:${ref.id}`;

/** Round only the corners: long sections stay aligned with the workspace's horizontal/vertical lanes. */
export function roundedRoute(points: Point[], radius = 12): string {
  if (!points.length) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const before = Math.hypot(b.x - a.x, b.y - a.y), after = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, before / 2, after / 2);
    if (!before || !after) continue;
    const p = { x: b.x + (a.x - b.x) / before * r, y: b.y + (a.y - b.y) / before * r };
    const q = { x: b.x + (c.x - b.x) / after * r, y: b.y + (c.y - b.y) / after * r };
    d += ` L ${p.x} ${p.y} Q ${b.x} ${b.y} ${q.x} ${q.y}`;
  }
  const end = points.at(-1)!;
  return `${d} L ${end.x} ${end.y}`;
}

function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    if (out.length && out.at(-1)!.x === p.x && out.at(-1)!.y === p.y) continue;
    while (out.length > 1) {
      const a = out.at(-2)!, b = out.at(-1)!;
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) out.pop(); else break;
    }
    out.push(p);
  }
  return out;
}

function port(p: Point, side: Side, record: boolean, gate: boolean) {
  const r = record ? gate ? 78 : 68 : 38;
  const edge = side === 'top' ? { x: p.x, y: p.y - (record ? 45 : 38) } : { x: p.x + (side === 'left' ? -r : r), y: p.y };
  const clearance = record ? gate ? 96 : 86 : 68;
  const outer = side === 'top'
    ? { x: p.x, y: Math.floor((p.y - (record ? 62 : 60)) / GRID) * GRID }
    : { x: (side === 'left' ? Math.floor((p.x - clearance) / GRID) : Math.ceil((p.x + clearance) / GRID)) * GRID, y: Math.round(edge.y / GRID) * GRID };
  const elbow = side === 'top' ? { x: outer.x, y: edge.y } : { x: outer.x, y: edge.y };
  return { edge, elbow, outer: { x: Math.round(outer.x / GRID) * GRID, y: Math.round(outer.y / GRID) * GRID } };
}

/** Bounded A*: routes around every actor, label and record, including at larger team sizes. */
function findPath(start: Point, end: Point, obstacles: Rect[], width: number, height: number): Point[] {
  const cols = Math.floor(width / GRID) + 1, rows = Math.floor(height / GRID) + 1;
  const id = (x: number, y: number) => y * cols + x;
  const sx = Math.round(start.x / GRID), sy = Math.round(start.y / GRID), ex = Math.round(end.x / GRID), ey = Math.round(end.y / GRID);
  const first = id(sx, sy), last = id(ex, ey);
  const cost = new Map<number, number>([[first, 0]]), prev = new Map<number, number>();
  const open = [{ id: first, x: sx, y: sy, score: 0, dir: -1 }];
  const closed = new Set<number>();
  const blocked = (x: number, y: number) => obstacles.some((r) => x * GRID > r.left && x * GRID < r.right && y * GRID > r.top && y * GRID < r.bottom);
  // A route visits at most the finite grid; no unbounded retry or per-animation-frame computation.
  while (open.length && closed.size < cols * rows) {
    open.sort((a, b) => b.score - a.score || b.id - a.id);
    const current = open.pop()!;
    if (closed.has(current.id)) continue;
    if (current.id === last) {
      const result = [{ x: ex * GRID, y: ey * GRID }];
      let at = last;
      while (at !== first) { at = prev.get(at)!; result.push({ x: (at % cols) * GRID, y: Math.floor(at / cols) * GRID }); }
      return result.reverse();
    }
    closed.add(current.id);
    for (const [dir, [dx, dy]] of [[1, 0], [0, 1], [-1, 0], [0, -1]].entries()) {
      const x = current.x + dx, y = current.y + dy, next = id(x, y);
      if (x < 2 || y < 2 || x >= cols - 2 || y >= rows - 2 || closed.has(next) || (next !== last && next !== first && blocked(x, y))) continue;
      const g = cost.get(current.id)! + 1 + (current.dir >= 0 && current.dir !== dir ? 3 : 0);
      if (g >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, g); prev.set(next, current.id);
      open.push({ id: next, x, y, score: g + Math.abs(ex - x) + Math.abs(ey - y), dir });
    }
  }
  // Do not draw a misleading diagonal through nodes when no corridor can be found.
  return [];
}

export function createNetworkRouter(run: Run, layout: NetworkLayout) {
  const rects = new Map<string, Rect>();
  for (const [id, p] of layout.points) {
    const record = id.startsWith('record:');
    const gate = record && run.records.some((r) => `record:${r.id}` === id && ['sandbox', 'honeypot'].includes(r.kind));
    rects.set(id, { left: p.x - (record ? gate ? 82 : 72 : 55), right: p.x + (record ? gate ? 82 : 72 : 55), top: p.y - (record ? gate ? 92 : 48 : 45), bottom: p.y + (record ? gate ? 92 : 48 : 77) });
  }
  const cache = new Map<string, { d: string; points: Point[] }>();
  const monitor = (ref: NodeRef) => run.actors.some((a) => a.id === ref.id && a.kind !== 'agent');
  return (from: NodeRef, to: NodeRef) => {
    const cacheKey = `${key(from)}>${key(to)}`;
    const cached = cache.get(cacheKey); if (cached) return cached;
    const a = layout.points.get(key(from)), b = layout.points.get(key(to));
    if (!a || !b || key(from) === key(to)) return { d: '', points: [] };
    const isGate = (ref: NodeRef) => ref.kind === 'record' && run.records.some((r) => r.id === ref.id && ['sandbox', 'honeypot'].includes(r.kind));
    const side = (p: Point): Side => p.x < layout.width / 2 ? 'left' : 'right';
    let fromSide: Side = b.x > a.x ? 'right' : 'left', toSide: Side = b.x > a.x ? 'left' : 'right';
    if (from.kind === 'actor' && to.kind === 'actor') {
      if (monitor(to)) { fromSide = side(a); toSide = side(a); }
      else if (monitor(from)) { fromSide = side(b); toSide = side(b); }
      else if (Math.abs(a.y - b.y) > 30 && Math.abs(a.x - b.x) < 30) { fromSide = side(a); toSide = side(b); }
    } else if (a.y < layout.agentTop && to.kind === 'actor') { fromSide = side(a); toSide = a.x >= b.x ? 'right' : 'left'; }
    else if (b.y < layout.agentTop && from.kind === 'actor') { fromSide = side(b); toSide = side(b); }
    const p = port(a, fromSide, from.kind === 'record', isGate(from));
    const q = port(b, toSide, to.kind === 'record', isGate(to));
    const obstacles = [...rects].filter(([id]) => id !== 'seat').map(([, r]) => r);
    const middle = findPath(p.outer, q.outer, obstacles, layout.width, layout.height);
    const points = middle.length ? simplify([p.edge, p.elbow, ...middle, q.elbow, q.edge]) : [];
    const result = { d: roundedRoute(points), points };
    cache.set(cacheKey, result);
    return result;
  };
}
