import { useState } from 'react';
import { Banknote, DoorOpen, FilePen, FolderOutput, KeyRound, Mail, Package, Settings2, Share2, ShieldAlert, Unplug, UserSearch, type LucideIcon } from 'lucide-react';
import { ATTACK_TYPES, DATASETS, HEADLINE, MODEL_RESULTS, PROBE, SOURCES, STACK } from '../model/results.ts';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const markSrc = (file: string) => `/marks/${file.includes('.') ? file : `${file}.svg`}`;
const ATTACK_ICONS: Record<string, LucideIcon> = {
  'File exfiltration': FolderOutput,
  'Credential harvest': KeyRound,
  'Log tampering': FilePen,
  'Backdoor install': DoorOpen,
  'Data forwarding': Share2,
  'Payment redirect': Banknote,
  Sabotage: Unplug,
  'Scraping personal data': UserSearch,
  'Privilege escalation': ShieldAlert,
  'Silent send': Mail,
  'Config poisoning': Settings2,
  'Supply chain': Package,
};

/** The results dashboard: headline numbers and the evidence behind the monitors. */
export function ResultsView() {
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

      <div className="dash-row">
        <Card title="Outside vs inside" note="AUC: 0.5 is a coin flip, 1.0 is perfect.">
          <MonitorBars />
        </Card>
        <Card title="Probe by layer" note={`Recomputed from ${PROBE.steps} steps in ${PROBE.runs} runs, folds grouped by run. Dashed line: shuffled labels, near a coin flip.`}>
          <LayerBars />
        </Card>
      </div>

      <div className="dash-row">
        <Card title="Probe score per step" note="Benign steps pile up near 0, malicious steps near 1. The probe never saw that run.">
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
          <ul className="attack-grid">
            {ATTACK_TYPES.map((t) => {
              const Icon = ATTACK_ICONS[t];
              return (
                <li key={t}>
                  {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden />}
                  {t}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Built with">
          <ul className="stack-list">
            {STACK.map((s) => (
              <li key={s.name}>
                <span className="mark-cluster">
                  {s.marks.map((m) => (
                    <img key={m.file} className="brand-mark" src={markSrc(m.file)} alt="" title={m.label} />
                  ))}
                </span>
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
              {s.mark && <img className="brand-mark" src={markSrc(s.mark.file)} alt="" title={s.mark.label} />}
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
              ) : (
                <span className="source-title">{s.title}</span>
              )}
              <span className="source-by">{s.by}</span>
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

/** Horizontal bars on a 0.5 to 1.0 axis, so the gap between watching outside and inside is the picture. */
function MonitorBars() {
  const bars = [
    { label: 'Coin flip', value: HEADLINE.chance, tone: 'faint' },
    { label: 'Visible actions only', value: HEADLINE.blackboxAuc, tone: 'mid' },
    { label: 'White-box probe', value: HEADLINE.whiteboxAuc, tone: 'strong' },
  ];
  const x = (v: number) => ((v - 0.4) / 0.6) * 100;
  const lift = HEADLINE.whiteboxAuc - HEADLINE.blackboxAuc;
  return (
    <div className="hbars">
      <p className="chart-callout">
        <strong>+{lift.toFixed(2)}</strong>
        <span>AUC gained by reading the hidden state, not the transcript</span>
      </p>
      {bars.map((b, i) => (
        <div key={b.label} className="hbar" style={{ animationDelay: `${i * 90}ms` }}>
          <span className="hbar-label">{b.label}</span>
          <div className="hbar-track">
            <i className="hbar-chance" style={{ left: `${x(0.5)}%` }} />
            <div className={`hbar-fill hbar-fill--${b.tone}`} style={{ width: `${x(b.value)}%` }} />
          </div>
          <span className="hbar-value">{b.value.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

/** Probe AUC at each captured layer, with the shuffled-label control as a second line. */
function LayerBars() {
  const W = 420;
  const H = 210;
  const pad = { l: 36, r: 12, t: 22, b: 30 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const y = (v: number) => pad.t + (1 - (v - 0.3) / 0.7) * innerH;
  const xs = PROBE.layers.map((_, i) => pad.l + (PROBE.layers.length === 1 ? innerW / 2 : (innerW * i) / (PROBE.layers.length - 1)));
  const line = (key: 'auc' | 'shuffled_auc') => PROBE.layers.map((l, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)} ${y(l[key]).toFixed(1)}`).join(' ');
  const area = `${line('auc')} L${xs.at(-1)} ${y(0.3)} L${xs[0]} ${y(0.3)} Z`;
  const best = PROBE.layers.reduce((a, b) => (b.auc > a.auc ? b : a));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart chart--layers" role="img" aria-label={`Probe AUC by layer: ${PROBE.layers.map((l) => `layer ${l.layer} ${l.auc}, shuffled ${l.shuffled_auc}`).join(', ')}`}>
      <defs>
        <linearGradient id="layer-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0645b1" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#0645b1" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={t === 0.5 ? 'chart-chance' : 'chart-grid'} />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="chart-tick">
            {t.toFixed(2)}
          </text>
        </g>
      ))}
      <path d={area} className="chart-area" />
      <path d={line('shuffled_auc')} className="chart-shuffle" />
      <path d={line('auc')} className="chart-line" />
      {PROBE.layers.map((l, i) => (
        <g key={l.layer}>
          <circle cx={xs[i]} cy={y(l.auc)} r={l.layer === best.layer ? 5.5 : 3.5} className={l.layer === best.layer ? 'chart-peak' : 'chart-node'} />
          {l.layer === best.layer && <circle cx={xs[i]} cy={y(l.auc)} r="11" className="chart-peak-ring" />}
          <text x={xs[i]} y={y(l.auc) - 12} textAnchor="middle" className={l.layer === best.layer ? 'chart-val chart-val--peak' : 'chart-val'}>
            {l.auc.toFixed(2)}
          </text>
          <text x={xs[i]} y={H - 8} textAnchor="middle" className="chart-tick">
            {l.layer}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Every step's held-out probe score at one layer, one row per true label: the gap between rows is the result. */
function Scores() {
  const best = PROBE.layers.reduce((a, b) => (b.auc > a.auc ? b : a));
  const [layer, setLayer] = useState(best.layer);
  const L = PROBE.layers.find((l) => l.layer === layer) ?? best;
  return (
    <>
      <div className="runs dash-tabs" role="radiogroup" aria-label="Layer">
        {PROBE.layers.map((l) => (
          <button key={l.layer} type="button" role="radio" aria-checked={l.layer === layer} onClick={() => setLayer(l.layer)}>
            Layer {l.layer}
          </button>
        ))}
      </div>
      <ScoreHist scores={L.scores} layer={layer} />
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

/** Benign counts grow up, malicious counts grow down. Switching layer reshapes both piles. */
function ScoreHist({ scores, layer }: { scores: [number, number][]; layer: number }) {
  const bins = 12;
  const tally = (label: number) => {
    const counts = Array.from({ length: bins }, () => 0);
    for (const [score, y] of scores) if (y === label) counts[Math.min(bins - 1, Math.floor(score * bins))] += 1;
    return counts;
  };
  const benign = tally(0);
  const malicious = tally(1);
  const max = Math.max(1, ...benign, ...malicious);
  return (
    <div>
      <div className="hist" role="img" aria-label={`Probe scores at layer ${layer}: benign steps pile up near 0, malicious steps near 1`}>
        {benign.map((count, i) => (
          <div className="hist-col" key={i}>
            <div className="hist-up" style={{ height: `${(count / max) * 100}%` }} />
            <div className="hist-down" style={{ height: `${(malicious[i] / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="hist-scale" aria-hidden>
        <span>0</span>
        <span>0.5</span>
        <span>1</span>
      </div>
    </div>
  );
}
