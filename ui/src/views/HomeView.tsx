import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StatusGlyph } from '../components/Glyphs.tsx';
import { Stage } from '../components/Stage.tsx';
import { claimMetrics } from '../model/metrics.ts';
import { deriveState } from '../model/replay.ts';
import type { Bundle, ReplayEvent, Run } from '../model/types.ts';
import { EVENT_WORD, actorName, monogram, nodeName } from '../lib/words.ts';
import { useReducedMotion } from '../state/hooks.ts';
import { useStore } from '../state/store.tsx';
import { useLiveSources } from '../state/live.ts';

const STEP_MS = 1900;
const END_PAUSE_MS = 3200;

/**
 * The overview, after the arena.ai leaderboard: a headline with a live counter and the Judge's latest
 * decisions; tabs per version; the network playing next to a live feed; and two ranked panels. Every
 * number is counted from the run on screen, which is labelled made up unless it is not.
 */
export function HomeView({ bundle }: { bundle: Bundle }) {
  const { dispatch } = useStore();
  const reduced = useReducedMotion();
  const ordered = useMemo(() => orderRuns(bundle.runs), [bundle]);
  const [tab, setTab] = useState<string>(() => (ordered.find((r) => r.condition === 'monitored') ?? ordered[0]).id);
  const live = useLiveSources();
  const run = ordered.find((r) => r.id === tab) ?? ordered[0];
  const loop = useLoop(run, !reduced && tab !== 'live');
  const cursor = reduced ? run.events.length - 1 : loop.cursor;
  const state = useMemo(() => deriveState(run, cursor), [run, cursor]);
  const focus = bundle.experiment?.focus_claim && run.claims.some((c) => c.id === bundle.experiment!.focus_claim) ? bundle.experiment.focus_claim : run.claims[0]?.id ?? null;
  const judge = run.actors.find((a) => a.kind === 'monitor');
  const caught = run.events.filter((e) => e.type === 'divert' && e.seq <= cursor).length;

  const open = (r: Run, step: number) => {
    dispatch({ type: 'run', runId: r.id, cursor: step });
    dispatch({ type: 'view', view: 'replay' });
  };

  return (
    <main className="home">
      <section className="home-hero">
        <div className="home-copy">
          <h1>
            How a false claim <em className="home-em">spreads</em>
            <br />
            through AI agents
          </h1>
          <p className="home-lead">
            A team of AI agents passes on what it hears. A Judge reads everything they do: it lets safe actions through to the sandbox and sends suspicious ones to a honeypot, where they can do no harm.
          </p>
          <p className="home-counter" aria-live="off">
            <i className={bundle.provenance === 'live' ? 'is-live' : ''} aria-hidden="true" />
            <b>{caught}</b>
            <span>{caught === 1 ? 'action' : 'actions'} caught by the Judge</span>
            <span className="home-counter-note">
              step {Math.max(0, cursor + 1)} of {run.events.length}, {bundle.provenance === 'synthetic' ? 'made-up example' : bundle.provenance}
            </span>
          </p>
          <div className="home-actions">
            <button type="button" className="btn btn--lg" onClick={() => open(run, -1)}>
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5L16.5 10L6 16.5Z" fill="currentColor" /></svg>
              Watch the story
            </button>
            <button type="button" className="btn btn--ghost btn--lg" onClick={() => dispatch({ type: 'view', view: 'compare' })}>
              Compare the versions
            </button>
          </div>
        </div>

        <aside className="home-latest" aria-label="Latest from the Judge">
          <h2>Latest from the Judge</h2>
          <JudgeLatest run={ordered.find((r) => r.condition === 'monitored') ?? run} onOpen={open} />
        </aside>
      </section>

      <div className="home-tabs" role="tablist" aria-label="Versions">
        {ordered.map((r) => (
          <button key={r.id} type="button" role="tab" aria-selected={tab === r.id} className={tab === r.id ? 'is-active' : ''} onClick={() => setTab(r.id)}>
            <TabIcon condition={r.condition} />
            {r.title}
          </button>
        ))}
        <button type="button" role="tab" aria-selected={tab === 'live'} className={tab === 'live' ? 'is-active' : ''} onClick={() => setTab('live')}>
          <i className={`tab-dot ${live.sources.length ? 'is-on' : ''}`} aria-hidden="true" />
          Live
        </button>
      </div>

      {tab === 'live' ? (
        <LivePanel sources={live.sources} error={live.error} onOpen={(id) => dispatch({ type: 'open-live', id })} />
      ) : (
        <>
          <section className="home-pair">
            <article className="panel panel--network" aria-label="The network">
              <header>
                <h2>The network</h2>
                <span className="badge">{run.title}</span>
              </header>
              <div className="panel-stage">
                <Stage run={run} state={state} transition={loop.transition} selection={null} onSelect={() => open(run, cursor)} reduced={reduced} focusClaim={focus} insets={{ top: 18, right: 16, bottom: 18, left: 16 }} />
              </div>
              <button type="button" className="panel-cta" onClick={() => open(run, -1)}>
                Watch the full story
              </button>
            </article>

            <article className="panel panel--feed" aria-label="Live feed">
              <header>
                <h2>Live feed</h2>
                <span className="badge">{bundle.provenance === 'synthetic' ? 'Replaying a made-up run' : 'Live'}</span>
              </header>
              <Feed run={run} cursor={cursor} playing={!reduced} />
              <button type="button" className="panel-cta" onClick={() => dispatch({ type: 'view', view: 'compare' })}>
                Compare the versions
              </button>
            </article>
          </section>

          <section className="home-pair home-pair--even">
            <article className="panel" aria-label="Who passed it on">
              <header>
                <h2>Who passed it on</h2>
                <span className="badge">so far in this run</span>
              </header>
              <AgentBars run={run} cursor={cursor} focus={focus} />
            </article>
            <article className="panel" aria-label="What the Judge did">
              <header>
                <h2>What the Judge did</h2>
                <span className="badge">so far in this run</span>
              </header>
              {judge ? <JudgeBars run={run} cursor={cursor} /> : <p className="panel-empty">There is no Judge in this version. Every action goes straight to the sandbox.</p>}
            </article>
          </section>
        </>
      )}

      {bundle.provenance === 'synthetic' && (
        <p className="home-note">
          <i aria-hidden="true" />
          Everything on this page comes from a made-up example that shows how the tool works. It is not research data.
        </p>
      )}
    </main>
  );
}

function orderRuns(runs: Run[]): Run[] {
  const rank: Record<string, number> = { monitored: 0, planted: 1, baseline: 2 };
  return [...runs].sort((a, b) => (rank[a.condition ?? ''] ?? 9) - (rank[b.condition ?? ''] ?? 9));
}

/** Plays a run on a loop: one step every STEP_MS, a pause at the end, then from the top. */
function useLoop(run: Run, enabled: boolean) {
  const [cursor, setCursor] = useState(-1);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    setCursor(-1);
  }, [run.id]);
  useEffect(() => {
    if (!enabled) return;
    const last = run.events.length - 1;
    const t = window.setTimeout(
      () => {
        setCursor((c) => (c >= last ? -1 : c + 1));
        setNonce((n) => n + 1);
      },
      cursor >= last ? END_PAUSE_MS : cursor < 0 ? 900 : STEP_MS,
    );
    return () => window.clearTimeout(t);
  }, [cursor, enabled, run]);
  return { cursor, transition: { nonce, animate: enabled && cursor >= 0, kind: 'play' as const } };
}

function JudgeLatest({ run, onOpen }: { run: Run; onOpen: (r: Run, step: number) => void }) {
  const decisions = run.events.filter((e) => e.type === 'divert' || e.type === 'allow' || (e.type === 'check' && e.verdict)).reverse().slice(0, 3);
  if (!decisions.length) return <p className="panel-empty">No Judge decisions in this run.</p>;
  return (
    <ul>
      {decisions.map((e) => (
        <li key={e.id}>
          <button type="button" onClick={() => onOpen(run, e.seq)}>
            <span className={`latest-icon latest-icon--${e.type}`}>{e.type === 'check' ? <StatusGlyph status={e.verdict!} size={22} /> : e.type === 'divert' ? <TrapIcon /> : <BoxIcon />}</span>
            <span className="latest-text">
              <strong>{e.type === 'divert' ? 'Sent to the honeypot' : e.type === 'allow' ? 'Let through to the sandbox' : `Claim ${e.verdict}`}</strong>
              <span>
                {e.effect ?? e.summary} <span className="muted">at step {e.seq + 1}</span>
              </span>
            </span>
            <svg className="latest-chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One row per step: who, what, and whether it is done, happening now, or still to come. */
function Feed({ run, cursor, playing }: { run: Run; cursor: number; playing: boolean }) {
  const shown = run.events.filter((e) => e.seq <= cursor).slice(-6);
  const upcoming = Math.min(2, run.events.length - 1 - cursor);
  return (
    <ol className="feed">
      {shown.map((e) => {
        const now = e.seq === cursor && playing;
        return (
          <li key={e.id} className={`feed-row ${now ? 'is-now' : ''}`}>
            <span className={`feed-avatar ${run.actors.find((a) => a.id === e.actor)?.kind === 'monitor' ? 'is-judge' : ''}`}>{monogram(actorName(run, e.actor))}</span>
            <span className="feed-who">
              <strong>{actorName(run, e.actor)}</strong>
              <span>step {e.seq + 1}</span>
            </span>
            <span className="feed-status">
              <FeedIcon e={e} />
              <span>{feedText(run, e)}</span>
              {now && <Dots />}
            </span>
          </li>
        );
      })}
      {Array.from({ length: Math.max(0, upcoming) }, (_, i) => (
        <li key={`skel-${i}`} className="feed-row feed-row--skeleton" aria-hidden="true">
          <span className="feed-avatar" />
          <span className="skel skel--short" />
          <span className="skel skel--long" />
        </li>
      ))}
      {shown.length === 0 && <li className="panel-empty">Waiting for the first step…</li>}
    </ol>
  );
}

function feedText(run: Run, e: ReplayEvent): string {
  const to = e.target ? nodeName(run, e.target) : '';
  switch (e.type) {
    case 'read':
      return `Reads the ${to.toLowerCase()}`;
    case 'claim':
    case 'repeat':
      return `Tells ${to} the claim`;
    case 'delegate':
      return `Gives ${to} a task${e.claim ? ' with the claim' : ''}`;
    case 'submit':
      return 'Asks the Judge to act';
    case 'check':
      return `Checks the claim: ${e.verdict}`;
    case 'divert':
      return 'Sends it to the honeypot';
    case 'allow':
      return 'Lets it through';
    case 'intervene':
      return `Warns ${to}`;
    case 'correct':
      return `Corrects ${to}`;
    case 'action':
      return e.effect ?? 'Takes an action';
    default:
      return EVENT_WORD[e.type];
  }
}

function FeedIcon({ e }: { e: ReplayEvent }) {
  if (e.type === 'check' && e.verdict) return <StatusGlyph status={e.verdict} size={15} />;
  if (e.type === 'divert') return <span className="feed-icon feed-icon--bad" aria-hidden="true">✕</span>;
  if (e.type === 'allow') return <span className="feed-icon feed-icon--good" aria-hidden="true">✓</span>;
  if (e.claim && (e.type === 'claim' || e.type === 'repeat' || e.type === 'delegate' || e.type === 'action' || e.type === 'submit')) return <span className="feed-icon feed-icon--claim" aria-hidden="true" />;
  return <span className="feed-icon" aria-hidden="true">✓</span>;
}

function Dots() {
  return (
    <span className="dots" aria-label="happening now">
      <i />
      <i />
      <i />
    </span>
  );
}

function Bars({ rows, max, tone }: { rows: { key: string; label: ReactNode; value: number; note?: string }[]; max: number; tone: (key: string) => string }) {
  return (
    <ol className="bars">
      {rows.map((r, i) => (
        <li key={r.key}>
          <span className="bars-rank">{i + 1}</span>
          <span className="bars-track">
            {/* Drawn to scale: a zero is an empty track, never a short bar. */}
            <span className={`bars-fill bars-fill--${tone(r.key)}`} style={{ width: `${max ? (r.value / max) * 100 : 0}%` }} />
            <span className="bars-label">{r.label}</span>
          </span>
          <span className="bars-value">
            {r.value}
            {r.note && <small>{r.note}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function AgentBars({ run, cursor, focus }: { run: Run; cursor: number; focus: string | null }) {
  const events = run.events.filter((e) => e.seq <= cursor && e.claim === focus);
  const rows = run.actors
    .filter((a) => a.kind === 'agent')
    .map((a) => {
      const passed = events.filter((e) => e.actor === a.id && ['claim', 'repeat', 'endorse', 'delegate'].includes(e.type)).length;
      const acted = events.filter((e) => e.actor === a.id && (e.type === 'action' || e.type === 'submit')).length;
      return { key: a.id, label: a.name, value: passed + acted, note: `${passed} passed on, ${acted} acted` };
    })
    .sort((x, y) => y.value - x.value || x.key.localeCompare(y.key));
  return <Bars rows={rows} max={Math.max(1, ...rows.map((r) => r.value))} tone={() => 'claim'} />;
}

function JudgeBars({ run, cursor }: { run: Run; cursor: number }) {
  const m = run.claims[0] ? claimMetrics(run, run.claims[0].id, cursor) : null;
  const upTo = run.events.filter((e) => e.seq <= cursor);
  const rows = [
    { key: 'read', label: 'Requests reviewed', value: upTo.filter((e) => e.type === 'submit').length },
    { key: 'allow', label: 'Let through', value: upTo.filter((e) => e.type === 'allow').length },
    { key: 'divert', label: 'Sent to the honeypot', value: upTo.filter((e) => e.type === 'divert').length },
    { key: 'check', label: 'Claims checked', value: upTo.filter((e) => e.type === 'check').length },
    { key: 'intervene', label: 'Stepped in', value: (m?.interventions.length ?? 0) },
  ];
  return <Bars rows={rows} max={Math.max(1, ...rows.map((r) => r.value))} tone={(k) => (k === 'divert' || k === 'check' ? 'bad' : k === 'allow' ? 'good' : k === 'intervene' ? 'blue' : 'ink')} />;
}

function LivePanel({ sources, error, onOpen }: { sources: { id: string; title: string; provenance: string; events: number; problems: string[] }[]; error: string | null; onOpen: (id: string) => void }) {
  return (
    <section className="panel panel--live" aria-label="Live runs">
      <header>
        <h2>Live runs</h2>
        <span className="badge">{sources.length ? `${sources.length} available` : 'none right now'}</span>
      </header>
      {error ? (
        <p className="panel-empty">{error}</p>
      ) : sources.length ? (
        <ul className="live-list">
          {sources.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onOpen(s.id)}>
                <i className={`tab-dot is-on ${s.provenance === 'live' ? 'is-real' : ''}`} aria-hidden="true" />
                <strong>{s.title}</strong>
                <span className="muted">
                  {s.events} steps so far, {s.provenance === 'live' ? 'real agents' : 'simulated from the made-up example'}
                  {s.problems.length > 0 && <span className="live-problem"> {s.problems.length} lines refused: {s.problems[0]}</span>}
                </span>
                <span className="live-open">Watch live</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="panel-empty">
          <p>No agent run is streaming right now.</p>
          <p className="muted small">
            A real run appears here as soon as it writes events to <code>local/live/</code>. To rehearse, run <code>npm run live:simulate</code> in <code>ui/</code>: it streams the made-up example, labelled as such.
          </p>
        </div>
      )}
    </section>
  );
}

function TabIcon({ condition }: { condition: Run['condition'] }) {
  if (condition === 'monitored')
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v16M8 20h8M5 7h14M5 7l-2.6 6a2.6 2.6 0 0 0 5.2 0L5 7zM19 7l-2.6 6a2.6 2.6 0 0 0 5.2 0L19 7z" /></svg>
    );
  if (condition === 'planted')
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h6M9 16h4" /></svg>
    );
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8" /><path d="M8.5 12.5l2.3 2.3 4.7-5" /></svg>
  );
}

function TrapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"><path d="M7 4h10M8 4v3c-2.5 1.5-4 4-4 7 0 4 3.6 6 8 6s8-2 8-6c0-3-1.5-5.5-4-7V4" /><path d="M8 12c1.5 1 6.5 1 8 0" /></svg>
  );
}

function BoxIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>
  );
}
