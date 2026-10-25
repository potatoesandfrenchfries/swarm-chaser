import { useState } from 'react';
import { claimMetrics, focusClaimOf, outcomeOf, type ClaimMetrics } from '../model/metrics.ts';
import { ATTACK_TYPES, DATASETS, HEADLINE, MODEL_RESULTS, PROBE, SOURCES, STACK } from '../model/results.ts';
import type { Bundle, Run } from '../model/types.ts';

const ORDER: Record<string, number> = { baseline: 0, planted: 1, monitored: 2 };
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The results dashboard: headline numbers, the demo's three versions, and the evidence behind the monitors. */
export function ResultsView({ bundle }: { bundle: Bundle }) {
  const runs = [...bundle.runs].sort((a, b) => (ORDER[a.condition ?? ''] ?? 9) - (ORDER[b.condition ?? ''] ?? 9));
  const focus = focusClaimOf(bundle);

  return (
    <main className="dash">
      <header className="dash-head">
        <span className="acad-pill">Results</span>
        <h1>Inside the model, intent shows up before the action does.</h1>
      </header>

      <section className="dash-kpis" aria-label="Headline numbers">
        <Kpi value={HEADLINE.whiteboxAuc.toFixed(2)} label="White-box AUC" note="on attack types it never saw" dark />
        <Kpi value={pct(HEADLINE.whiteboxAccuracy)} label="White-box accuracy" note="malicious vs benign steps" />
        <Kpi value={HEADLINE.blackboxAuc.toFixed(2)} label="Visible actions only" note="AUC from the transcript alone" />
        <Kpi value={String(ATTACK_TYPES.length)} label="Attack types" note="from exfiltration to supply chain" />
      </section>

      <Card title="The demo, three ways" note={bundle.experiment?.caveats[0]}>
        <div className="run-grid">
          {runs.map((r) => (
            <RunTile key={r.id} run={r} m={focus ? claimMetrics(r, focus) : null} />
          ))}
        </div>
      </Card>

      <div className="dash-row">
        <Card title="Outside vs inside" note="AUC: 0.5 is a coin flip, 1.0 is perfect.">
          <MonitorBars />
        </Card>
        <Card title="Probe by layer" note={`Recomputed from ${PROBE.steps} steps in ${PROBE.runs} runs, folds grouped by run. Grey dot: shuffled labels.`}>
          <LayerBars />
        </Card>
      </div>

      <div className="dash-row">
        <Card title="Probe score per step" note="Each dot is one agent step, scored by a probe that never saw its run.">
          <Scores />
        </Card>
        <Card title="Results by model">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Agent model</th>
                <th>Monitor</th>
                <th>AUC</th>
                <th>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {MODEL_RESULTS.map((r) => (
                <tr key={r.monitor}>
                  <td>{r.model}</td>
                  <td>{r.monitor}</td>
                  <td className="num">{r.auc.toFixed(2)}</td>
                  <td className="num">{r.accuracy === null ? '–' : pct(r.accuracy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="dash-sub">Trained and tested on</h3>
          <ul className="dash-list">
            {DATASETS.map((d) => (
              <li key={d.name}>
                <strong>{d.name}</strong>
                <span>{d.use}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="dash-row">
        <Card title="Attack types tested">
          <ul className="dash-chips">
            {ATTACK_TYPES.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Card>
        <Card title="Built with">
          <ul className="dash-list">
            {STACK.map((s) => (
              <li key={s.name}>
                <strong>{s.name}</strong>
                <span>{s.detail}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Sources">
        <ol className="dash-sources">
          {SOURCES.map((s) => (
            <li key={s.title}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
              <span>{s.by}</span>
            </li>
          ))}
        </ol>
      </Card>
    </main>
  );
}

function Kpi({ value, label, note, dark = false }: { value: string; label: string; note: string; dark?: boolean }) {
  return (
    <div className={`kpi ${dark ? 'kpi--dark' : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{note}</small>
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="dash-card" aria-label={title}>
      <h2>{title}</h2>
      {children}
      {note && <p className="dash-note">{note}</p>}
    </section>
  );
}

function RunTile({ run, m }: { run: Run; m: ClaimMetrics | null }) {
  const outcome = outcomeOf(m);
  const agents = run.actors.filter((a) => a.kind === 'agent').length;
  const present = Boolean(m?.present);
  const stats = [
    { label: 'agents reached', value: present ? `${m!.exposed.length}/${agents}` : '0' },
    { label: 'tried to act on it', value: present ? String(m!.actions.length) : '0' },
    { label: 'harmful actions that ran', value: present ? String(m!.gotThrough.length) : '0' },
    { label: 'steps until caught', value: m?.detectionDistance != null ? String(m.detectionDistance) : '–' },
  ];
  return (
    <article className={`run-tile run-tile--${outcome.tone}`} aria-label={run.title}>
      <header>
        <h3>{run.title}</h3>
        <p>{run.notes[0]}</p>
      </header>
      <strong className="run-outcome">{outcome.word}</strong>
      <dl className="run-stats">
        {stats.map((s) => (
          <div key={s.label}>
            <dd>{s.value}</dd>
            <dt>{s.label}</dt>
          </div>
        ))}
      </dl>
    </article>
  );
}

/** Horizontal bars on a 0.5 to 1.0 axis, so the gap between watching outside and inside is the picture. */
function MonitorBars() {
  const bars = [
    { label: 'Coin flip', value: HEADLINE.chance, tone: 'faint' },
    { label: 'Visible actions only', value: HEADLINE.blackboxAuc, tone: 'mid' },
    { label: 'White-box probe', value: HEADLINE.whiteboxAuc, tone: 'strong' },
  ];
  const x = (v: number) => ((v - 0.4) / 0.6) * 100;
  return (
    <div className="hbars">
      {bars.map((b) => (
        <div key={b.label} className="hbar">
          <span className="hbar-label">{b.label}</span>
          <div className="hbar-track">
            <div className={`hbar-fill hbar-fill--${b.tone}`} style={{ width: `${x(b.value)}%` }} />
          </div>
          <span className="hbar-value">{b.value.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

/** Probe AUC at each captured layer, with the shuffled-label control beside it. */
function LayerBars() {
  const W = 420;
  const H = 200;
  const pad = { l: 34, r: 8, t: 24, b: 28 };
  const y = (v: number) => pad.t + (1 - (v - 0.3) / 0.7) * (H - pad.t - pad.b);
  const bw = (W - pad.l - pad.r) / PROBE.layers.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Probe AUC by layer: ${PROBE.layers.map((l) => `layer ${l.layer} ${l.auc}`).join(', ')}`}>
      {[0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={t === 0.5 ? 'chart-chance' : 'chart-grid'} />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="chart-tick">
            {t.toFixed(2)}
          </text>
        </g>
      ))}
      {PROBE.layers.map((l, i) => {
        const cx = pad.l + bw * i + bw / 2;
        return (
          <g key={l.layer}>
            <rect x={cx - bw * 0.3} width={bw * 0.6} y={y(l.auc)} height={y(0.3) - y(l.auc)} rx="4" className="chart-bar" />
            <text x={cx} y={y(l.auc) - 6} textAnchor="middle" className="chart-val">
              {l.auc.toFixed(2)}
            </text>
            <circle cx={cx} cy={y(l.shuffled_auc)} r="4" className="chart-control" />
            <text x={cx} y={H - 8} textAnchor="middle" className="chart-tick">
              layer {l.layer}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Every step's held-out probe score at one layer, one row per true label: the gap between rows is the result. */
function Scores() {
  const best = PROBE.layers.reduce((a, b) => (b.auc > a.auc ? b : a));
  const [layer, setLayer] = useState(best.layer);
  const L = PROBE.layers.find((l) => l.layer === layer) ?? best;
  const W = 420;
  const H = 150;
  const x = (v: number) => 20 + v * (W - 40);
  const rowY = (label: number) => (label ? 104 : 44);
  return (
    <>
      <div className="runs dash-tabs" role="radiogroup" aria-label="Layer">
        {PROBE.layers.map((l) => (
          <button key={l.layer} type="button" role="radio" aria-checked={l.layer === layer} onClick={() => setLayer(l.layer)}>
            Layer {l.layer}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart chart--scatter" role="img" aria-label={`Probe scores at layer ${layer}: benign steps sit near 0, malicious steps near 1`}>
        <line x1={x(0.5)} x2={x(0.5)} y1={18} y2={128} className="chart-chance" />
        <text x={x(0)} y={H - 6} className="chart-tick">0 · benign</text>
        <text x={x(1)} y={H - 6} textAnchor="end" className="chart-tick">malicious · 1</text>
        {L.scores.map(([s, label], i) => (
          <circle key={`${layer}-${i}`} cx={x(s)} cy={rowY(label) + ((i * 7) % 15) - 7} r="4.5" className={label ? 'dot dot--bad' : 'dot dot--ok'} />
        ))}
      </svg>
      <p className="legend-row">
        <span>
          <i className="dot-key dot-key--ok" /> benign step
        </span>
        <span>
          <i className="dot-key dot-key--bad" /> malicious step
        </span>
        <span className="muted">
          AUC {L.auc.toFixed(2)}, accuracy {pct(L.accuracy)} at this layer
        </span>
      </p>
    </>
  );
}
