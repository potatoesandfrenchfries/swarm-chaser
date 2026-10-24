import type { Channel } from '../model/replay.ts';
import type { Run } from '../model/types.ts';

export interface Point {
  x: number;
  y: number;
}

export interface Placed extends Point {
  id: string;
  kind: 'actor' | 'record';
  /** Radius used to trim edges where they meet the node. */
  r: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Deterministic "stream" layout. Agents run left to right in the order the focus claim first reaches
 * them (then by first involvement), on a shallow arch, so the claim visibly travels across the stage.
 * Monitors sit below the stream. Each record sits beside the actor that first touches it: above or
 * below for agents (away from the middle), outward to the side for monitors. Same run, box and focus
 * claim give the same positions every time.
 */
export function layoutRun(run: Run, box: Box, compact = false, focusClaim: string | null = null): Map<string, Placed> {
  const first = new Map<string, number>();
  const reached = new Map<string, number>();
  for (const e of run.events) {
    if (!first.has(e.actor)) first.set(e.actor, e.seq);
    if (e.target && !first.has(e.target.id)) first.set(e.target.id, e.seq + 0.5);
    if (focusClaim && e.claim === focusClaim) {
      if (!reached.has(e.actor)) reached.set(e.actor, e.seq);
      if (e.target?.kind === 'actor' && !reached.has(e.target.id)) reached.set(e.target.id, e.seq + 0.5);
    }
  }
  const order = (id: string) => (reached.get(id) ?? 1e6 + (first.get(id) ?? 1e6));
  const agents = run.actors.filter((a) => a.kind === 'agent').sort((a, b) => order(a.id) - order(b.id));
  const monitors = run.actors.filter((a) => a.kind !== 'agent');
  const nodeR = compact ? 15 : 30;
  const placed = new Map<string, Placed>();

  const cy = box.top + box.height * (compact ? (monitors.length ? 0.48 : 0.55) : 0.56);
  const arch = box.height * (compact ? 0.2 : 0.22);
  const margin = box.width * (compact ? 0.12 : 0.1);
  agents.forEach((a, i) => {
    const t = agents.length === 1 ? 0.5 : i / (agents.length - 1);
    // A shallow arch with a slight alternation, so hops between neighbours do not lie on one line.
    const y = cy - arch * Math.sin(Math.PI * t) + (i % 2 ? arch * 0.22 : 0);
    placed.set(a.id, { id: a.id, kind: 'actor', x: box.left + margin + (box.width - 2 * margin) * t, y, r: nodeR });
  });
  monitors.forEach((m, i) => {
    // Lower right: the caption owns the lower left of the stage.
    placed.set(m.id, { id: m.id, kind: 'actor', x: box.left + box.width * (compact ? 0.4 + i * 0.16 : 0.68 - i * 0.16), y: box.top + box.height * (compact ? 0.84 : 0.88), r: nodeR });
  });

  // Records: try a few spots around the actor that first touches them and take the first one that is
  // clear of every node (with its label underneath) and every card placed so far.
  const recordR = compact ? 14 : 36;
  // Card width scales with the stage; Stage sets the same value as --record-w so CSS and this test agree.
  const w = compact ? 96 : recordWidth(box);
  const h = compact ? 24 : 70;
  const off = compact ? 34 : Math.max(84, Math.min(118, box.height * 0.3));
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  for (const n of placed.values()) rects.push({ x: n.x - n.r - 10, y: n.y - n.r - 10, w: 2 * n.r + 20, h: 2 * n.r + (compact ? 20 : 56) });
  const overlap = (p: Point) =>
    rects.reduce((sum, r) => {
      const ox = Math.min(p.x + w / 2 + 8, r.x + r.w) - Math.max(p.x - w / 2 - 8, r.x);
      const oy = Math.min(p.y + h / 2 + 6, r.y + r.h) - Math.max(p.y - h / 2 - 6, r.y);
      return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
    }, 0);
  const inBox = (p: Point) => ({ x: clamp(p.x, box.left + w / 2, box.left + box.width - w / 2), y: clamp(p.y, box.top + h / 2, box.top + box.height - h / 2) });
  for (const rec of [...run.records].sort((a, b) => order(a.id) - order(b.id))) {
    const toucher = run.events.find((e) => e.target?.kind === 'record' && e.target.id === rec.id);
    const anchor = toucher ? placed.get(toucher.actor) : undefined;
    const side = compact ? 84 : 200;
    const tries: Point[] = !anchor
      ? [{ x: box.left + box.width - w / 2, y: box.top + h / 2 }]
      : monitors.some((m) => m.id === toucher!.actor)
        ? [{ x: anchor.x - side, y: anchor.y }, { x: anchor.x + side, y: anchor.y }, { x: anchor.x, y: anchor.y - off }]
        : [
            { x: anchor.x, y: anchor.y - off },
            { x: anchor.x + side * 0.9, y: anchor.y - off * 0.55 },
            { x: anchor.x - side * 0.9, y: anchor.y - off * 0.55 },
            { x: anchor.x - side, y: anchor.y + off * 0.4 },
            { x: anchor.x + side, y: anchor.y + off * 0.4 },
            { x: anchor.x, y: anchor.y + off + 30 },
            { x: anchor.x + side * 1.5, y: anchor.y },
            { x: anchor.x - side * 1.5, y: anchor.y },
          ];
    const candidates = tries.map(inBox);
    // First spot with no overlap; failing that, the one that overlaps least.
    const p = candidates.find((c) => overlap(c) === 0) ?? candidates.reduce((best, c) => (overlap(c) < overlap(best) ? c : best));
    rects.push({ x: p.x - w / 2, y: p.y - h / 2, w, h });
    placed.set(rec.id, { id: rec.id, kind: 'record', ...p, r: recordR });
  }
  return placed;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Offset so several channels between one pair of nodes do not overlap. */
const CHANNEL_OFFSET: Record<Channel, number> = {
  claim: 0,
  'claim-action': 0,
  action: 0,
  'corrective-action': 16,
  read: -16,
  task: -16,
  check: 0,
  intervene: 18,
  correct: 18,
  dispute: 18,
};

export interface Curve {
  p0: Point;
  c: Point;
  p1: Point;
  d: string;
  length: number;
}

/** A quadratic curve from one node to another, bowed away from the stage centre and trimmed at both ends. */
export function curveBetween(a: Placed, b: Placed, channel: Channel, center: Point): Curve {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  let nx = -uy;
  let ny = ux;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // Bow outward: flip the normal if it points at the centre.
  if ((mid.x - center.x) * nx + (mid.y - center.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const bend = Math.min(90, dist * 0.14) + CHANNEL_OFFSET[channel];
  const c = { x: mid.x + nx * bend, y: mid.y + ny * bend };
  const p0 = toward(a, c, a.r + 8);
  const p1 = toward(b, c, b.r + 10);
  const d = `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)} Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  return { p0, c, p1, d, length: approxLength(p0, c, p1) };
}

function toward(from: Point, to: Point, by: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / l) * by, y: from.y + (dy / l) * by };
}

export function pointOn(cv: Curve, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * cv.p0.x + 2 * u * t * cv.c.x + t * t * cv.p1.x,
    y: u * u * cv.p0.y + 2 * u * t * cv.c.y + t * t * cv.p1.y,
  };
}

function approxLength(p0: Point, c: Point, p1: Point): number {
  let len = 0;
  let prev = p0;
  const cv = { p0, c, p1 } as Curve;
  for (let i = 1; i <= 24; i++) {
    const p = pointOn(cv, i / 24);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

/** Width of a record card on the stage, shared by the layout and the CSS (--record-w). */
export function recordWidth(box: Box): number {
  return Math.round(Math.max(150, Math.min(206, box.width * 0.22)));
}
