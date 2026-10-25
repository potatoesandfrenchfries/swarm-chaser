import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { HeroCollage } from '../components/HeroCollage.tsx';
import { Button } from '../components/ui/button.tsx';
import type { Bundle } from '../model/types.ts';
import { useReducedMotion } from '../state/hooks.ts';
import { useStore } from '../state/store.tsx';

type Stat = { value: number; prefix?: string; suffix?: string; decimals?: number };

/** Public incidents that show agents and trusted-looking records being used for harm. */
const EVIDENCE: { stat: Stat | null; quote?: string; body: string; when: string; url: string }[] = [
  {
    stat: { value: 90, suffix: '%' },
    body: 'of the hacking in a state-backed espionage campaign was done by an AI agent (Anthropic’s upper estimate). It had been told it was doing a legitimate pen test.',
    when: 'Nov 2025 · Anthropic',
    url: 'https://www.anthropic.com/news/disrupting-AI-espionage',
  },
  {
    stat: { value: 17600 },
    body: 'actions taken by AI agents that escaped a test sandbox and broke into Hugging Face.',
    when: 'Jul 2026 · The Hacker News',
    url: 'https://thehackernews.com/2026/07/openai-agent-used-exposed-credentials.html',
  },
  {
    stat: null,
    quote: '“Fix typo”',
    body: 'was the message on two backdoor commits pushed to PHP’s source. The record looked routine. The intent was not.',
    when: 'Mar 2021 · PHP.Watch',
    url: 'https://php.watch/news/2021/03/git-php-net-hack',
  },
  {
    stat: { value: 4.99, prefix: '$', suffix: 'M', decimals: 2 },
    body: 'average cost of a data breach, up 12% in a year. $11.5M in the US.',
    when: '2026 · IBM',
    url: 'https://www.ibm.com/reports/data-breach',
  },
];

const MONITORS = [
  {
    tag: 'Black-box',
    title: 'What it does',
    body: 'Judges the agent by what it says and which tools it calls.',
    spec: '9 transcript features · logistic regression',
  },
  {
    tag: 'White-box',
    title: 'What it is thinking',
    body: 'Reads the model’s internal activations at every decision and flags the signature of malicious intent.',
    spec: 'Qwen2.5-3B · 37 layers × 2,048 · probe tested on held-out runs',
  },
] as const;

/** Counts from the data and code in this repo: local/hf (AI Village), ScaleAI/mrt (STRESSTEST.md), src/whitebox. */
const DATA = [
  { value: 192167, label: 'AI Village messages' },
  { value: 630, label: 'labelled agent runs' },
  { value: 12, label: 'attack types simulated' },
  { value: 37, label: 'model layers probed' },
  { value: 2048, label: 'activations per layer' },
  { value: 96, label: 'known agent failures' },
];

/** Counts up to `value` once the element scrolls into view. */
function Count({ value, prefix = '', suffix = '', decimals = 0 }: Stat) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced || !ref.current) return;
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / 1400);
        setN(value * (1 - (1 - p) ** 3));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value, reduced]);

  const shown = n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span ref={ref}>{prefix}{shown}{suffix}</span>;
}

/** Agents in their environment; the black-box monitor reads their output, the white-box monitor reads one agent's activations, and both feed one verdict. */
function SystemDiagram() {
  return (
    <svg viewBox="0 0 720 380" className="acad-diagram" role="img" aria-label="Black-box monitor reads agents' messages and tool calls; white-box monitor reads one agent's activations; both feed a verdict that allows or blocks the action">
      <rect x="250" y="130" width="250" height="220" rx="12" className="sys-env" />
      <text x="375" y="158" textAnchor="middle" className="sys-label">Agent environment</text>
      <rect x="278" y="186" width="92" height="92" rx="10" className="sys-focus" />
      {[[324, 232], [440, 220], [384, 304]].map(([x, y]) => (
        <g key={x}>
          <circle cx={x} cy={y} r="30" className="sys-agent" />
          <text x={x} y={y + 5} textAnchor="middle" className="sys-agent-label">Agent</text>
        </g>
      ))}

      <rect x="310" y="20" width="130" height="56" rx="8" className="sys-black" />
      <text x="375" y="53" textAnchor="middle" className="sys-black-label">Black-box</text>
      <line x1="375" y1="76" x2="375" y2="130" className="sys-wire" />
      <line x1="375" y1="130" x2="375" y2="76" className="sys-flow" pathLength={1} />
      <text x="388" y="108" className="sys-cap">messages, tool calls</text>

      <rect x="20" y="200" width="150" height="64" rx="8" className="sys-white" />
      <text x="95" y="228" textAnchor="middle" className="sys-white-label">White-box</text>
      <text x="95" y="248" textAnchor="middle" className="sys-cap">activations</text>
      <line x1="278" y1="232" x2="170" y2="232" className="sys-wire" />
      <line x1="278" y1="232" x2="170" y2="232" className="sys-flow" pathLength={1} />

      <path d="M440 48 L600 48 L600 190" className="sys-wire" fill="none" />
      <path d="M95 264 L95 360 L600 360 L600 262" className="sys-wire" fill="none" />
      <rect x="548" y="190" width="104" height="72" rx="10" className="sys-verdict" />
      <text x="600" y="222" textAnchor="middle" className="sys-verdict-label">Verdict</text>
      <text x="600" y="244" textAnchor="middle" className="sys-cap">allow · block</text>
      <g className="sys-block">
        <circle cx="652" cy="190" r="12" />
        <path d="M647 185 L657 195 M657 185 L647 195" />
      </g>
    </svg>
  );
}

export function LandingView({ bundle }: { bundle: Bundle }) {
  const { dispatch } = useStore();
  const go = (view: 'demo' | 'results') => dispatch({ type: 'view', view });
  const heroRun = bundle.runs.find((r) => r.condition === 'monitored') ?? bundle.runs[0];

  return (
    <>
      <main className="acad-main">
        <HeroCollage run={heroRun} />

        <section className="acad-slide">
          <span className="acad-pill">Monitoring for AI agents</span>
          <h1>See what an AI agent does, and what it is thinking.</h1>
          <p className="acad-lead">
            Agents now read files, send email and run commands for us. VETO watches each one from both sides and stops a
            harmful action before it runs.
          </p>
        </section>

        <section id="problem" className="acad-slide">
          <span className="acad-pill acad-pill--bad">Problem</span>
          <h2>AI agents are already being used for attacks.</h2>
          <div className="acad-tiles acad-tiles--2">
            {EVIDENCE.map((e) => (
              <a key={e.url} href={e.url} target="_blank" rel="noreferrer" className="acad-tile acad-tile--link">
                <strong>{e.stat ? <Count {...e.stat} /> : e.quote}</strong>
                <p>{e.body}</p>
                <span>{e.when}</span>
              </a>
            ))}
          </div>
          <p className="acad-lead">The transcript often looks fine. The intent is somewhere else.</p>
        </section>

        <section id="method" className="acad-slide">
          <span className="acad-pill">Method</span>
          <h2>Two monitors. Two independent lines of evidence.</h2>
          <div className="acad-system"><SystemDiagram /></div>
          <div className="acad-tiles acad-tiles--2">
            {MONITORS.map((m, i) => (
              <div key={m.tag} className={i === 0 ? 'acad-tile acad-tile--dark' : 'acad-tile'}>
                <span className="acad-tile-tag">{m.tag}</span>
                <h3>{m.title}</h3>
                <p>{m.body}</p>
                <code>{m.spec}</code>
              </div>
            ))}
          </div>
        </section>

        <section id="data" className="acad-slide">
          <span className="acad-pill">Data</span>
          <h2>Built on real agent data.</h2>
          <div className="acad-tiles acad-tiles--3">
            {DATA.map((s) => (
              <div key={s.label} className="acad-tile">
                <strong><Count value={s.value} /></strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          <p className="acad-small">AI Village by AI Digest (agents from Anthropic, OpenAI and Google, April 2025 to September 2026) and ScaleAI/mrt.</p>
        </section>

        <section className="acad-cta">
          <h2>See an agent get stopped.</h2>
          <div className="acad-cta__actions">
            <Button type="button" size="lg" onClick={() => go('demo')}>
              Watch the demo
              <ArrowRight aria-hidden />
            </Button>
            <Button type="button" size="lg" variant="outline" onClick={() => go('results')}>
              See the results
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}
