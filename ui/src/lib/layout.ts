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

/** Key of the empty Judge seat drawn when a hub run has no Judge. */
export const HUB_SEAT = '__hub';

/**
 * Deterministic layout. Runs that have a Judge or a sandbox use the hub layout from the team's sketch:
 * the Judge in the middle, agents around it in the order the focus claim reaches them (top, then down
 * the left), the sandbox top right and the honeypot bottom right. A hub run without a Judge keeps an
 * empty seat in the middle so versions compare at a glance. Other runs use a left-to-right stream.
 * Records go to the first clear spot around the actor that first touches them. Same input, same output.
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
  const w = compact ? 96 : recordWidth(box);
  const h = compact ? 24 : 70;
  const gates = run.records.filter((r) => r.kind === 'sandbox' || r.kind === 'honeypot');
  const hub = monitors.length > 0 || gates.length > 0;

  if (hub) {
    // Sandbox and honeypot hold the right edge; the Judge sits in the middle of what is left.
    const right = box.left + box.width - (compact ? 52 : w / 2 + 4);
    for (const g of gates) {
      const y = box.top + box.height * (g.kind === 'sandbox' ? (compact ? 0.18 : 0.16) : compact ? 0.82 : 0.84);
      placed.set(g.id, { id: g.id, kind: 'record', x: right, y, r: compact ? 16 : 40 });
    }
    const areaRight = gates.length ? right - (compact ? 60 : w / 2 + 40) : box.left + box.width;
    const jx = box.left + (areaRight - box.left) * 0.58;
    const jy = box.top + box.height * 0.5;
    if (monitors.length) monitors.forEach((m, i) => placed.set(m.id, { id: m.id, kind: 'actor', x: jx + i * 70, y: jy, r: compact ? 17 : 34 }));
    else placed.set(HUB_SEAT, { id: HUB_SEAT, kind: 'actor', x: jx, y: jy, r: compact ? 17 : 34 });
    const rx = Math.max(60, Math.min(jx - box.left - (compact ? 22 : 60), compact ? 200 : 360));
    const ry = Math.max(50, box.height * (compact ? 0.4 : 0.41));
    agents.forEach((a, i) => {
      // From the top, round the left side, to the bottom.
      const t = agents.length === 1 ? 0.5 : i / (agents.length - 1);
      // Wraps over the top and under the bottom of the Judge, open on the right toward sandbox and honeypot.
      const deg = -70 - t * 220;
      const rad = (deg * Math.PI) / 180;
      placed.set(a.id, { id: a.id, kind: 'actor', x: jx + rx * Math.cos(rad), y: jy + ry * Math.sin(rad), r: nodeR });
    });
  } else {
    const cy = box.top + box.height * (compact ? 0.55 : 0.56);
    const arch = box.height * (compact ? 0.2 : 0.22);
    const margin = box.width * (compact ? 0.12 : 0.1);
    agents.forEach((a, i) => {
      const t = agents.length === 1 ? 0.5 : i / (agents.length - 1);
      const y = cy - arch * Math.sin(Math.PI * t) + (i % 2 ? arch * 0.22 : 0);
      placed.set(a.id, { id: a.id, kind: 'actor', x: box.left + margin + (box.width - 2 * margin) * t, y, r: nodeR });
    });
  }

  // Remaining records: first clear spot around their first toucher (nodes include their label underneath).
  const off = compact ? 40 : Math.max(84, Math.min(118, box.height * 0.28));
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  for (const n of placed.values()) {
    const isGate = n.kind === 'record';
    rects.push(isGate ? { x: n.x - w / 2, y: n.y - h / 2, w, h } : { x: n.x - n.r - 10, y: n.y - n.r - 10, w: 2 * n.r + 20, h: 2 * n.r + (compact ? 20 : 56) });
  }
  const overlap = (p: Point) =>
    rects.reduce((sum, r) => {
      const ox = Math.min(p.x + w / 2 + 8, r.x + r.w) - Math.max(p.x - w / 2 - 8, r.x);
      const oy = Math.min(p.y + h / 2 + 6, r.y + r.h) - Math.max(p.y - h / 2 - 6, r.y);
      return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
    }, 0);
  const inBox = (p: Point) => ({ x: clamp(p.x, box.left + w / 2, box.left + box.width - w / 2), y: clamp(p.y, box.top + h / 2, box.top + box.height - h / 2) });
  const side = compact ? 84 : 200;
  for (const rec of [...run.records].filter((r) => !placed.has(r.id)).sort((a, b) => order(a.id) - order(b.id))) {
    const toucher = run.events.find((e) => e.target?.kind === 'record' && e.target.id === rec.id);
    const anchor = toucher ? placed.get(toucher.actor) : undefined;
    // A record nobody touches (the truth nobody checked) waits near the middle, above or below the hub.
    const hubAt = [...placed.values()].find((n) => n.id === HUB_SEAT || monitors.some((m) => m.id === n.id));
    const tries: Point[] = !anchor
      ? hubAt
        ? [
            { x: hubAt.x + side * 0.85, y: hubAt.y },
            { x: hubAt.x + side * 0.6, y: hubAt.y - off },
            { x: hubAt.x + side * 0.6, y: hubAt.y + off },
            { x: box.left + w / 2, y: box.top + h / 2 },
          ]
        : [{ x: box.left + w / 2, y: box.top + h / 2 }]
      : [
          { x: anchor.x, y: anchor.y - off },
          { x: anchor.x - side * 0.9, y: anchor.y - off * 0.55 },
          { x: anchor.x + side * 0.9, y: anchor.y - off * 0.55 },
          { x: anchor.x - side, y: anchor.y + off * 0.4 },
          { x: anchor.x + side, y: anchor.y + off * 0.4 },
          { x: anchor.x, y: anchor.y + off + 30 },
          { x: anchor.x - side * 1.5, y: anchor.y },
          { x: anchor.x + side * 1.5, y: anchor.y },
        ];
    const candidates = tries.map(inBox);
    // First spot with no overlap; failing that, the one that overlaps least.
    const p = candidates.find((c) => overlap(c) === 0) ?? candidates.reduce((best, c) => (overlap(c) < overlap(best) ? c : best));
    rects.push({ x: p.x - w / 2, y: p.y - h / 2, w, h });
    placed.set(rec.id, { id: rec.id, kind: 'record', ...p, r: compact ? 14 : 36 });
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
  submit: 0,
  allow: 0,
  divert: 0,
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
