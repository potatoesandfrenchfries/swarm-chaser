import { LayoutDashboard, ListTree, Network } from 'lucide-react';
import { claimMetrics, focusClaimOf, outcomeOf } from '../model/metrics.ts';
import type { Bundle } from '../model/types.ts';
import { MODEL_RESULTS } from '../model/results.ts';
import { PROVENANCE_NOTE, PROVENANCE_WORD } from '../lib/words.ts';
import { useLiveSources } from '../state/live.ts';
import { NewTask } from './NewTask.tsx';
import { useStore, type LiveState, type View } from '../state/store.tsx';

const VIEWS: { id: View; label: string; key: string; Icon: typeof Network }[] = [
  { id: 'overview', label: 'Overview', key: '1', Icon: LayoutDashboard },
  { id: 'activity', label: 'Activity', key: '2', Icon: ListTree },
  { id: 'graph', label: 'Graph', key: '3', Icon: Network },
];

/** The app's frame: views, the runs in the open dataset with their outcome, and what is being monitored. */
export function Sidebar({ bundle }: { bundle: Bundle | null }) {
  const { state, dispatch } = useStore();
  const valid = state.bundles?.filter((b) => !b.problems.length) ?? [];
  const live = useLiveSources();
  const focus = bundle ? focusClaimOf(bundle) : null;

  return (
    <aside className="sidebar" aria-label="App">
      <button type="button" className="wordmark" onClick={() => dispatch({ type: 'view', view: 'home' })} aria-label="VETO, home">
        VETO
      </button>
      <NewTask />

      <nav className="side-nav" aria-label="Views">
        {VIEWS.map(({ id, label, key, Icon }) => (
          <button key={id} type="button" className={state.view === id ? 'is-active' : ''} aria-current={state.view === id ? 'page' : undefined} onClick={() => dispatch({ type: 'view', view: id })} title={`${label} (${key})`}>
            <Icon size={17} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {bundle && !state.live && (
        <section className="side-section" aria-label="Sessions">
          <h2>Sessions</h2>
          <div role="radiogroup" aria-label="Version" className="side-runs">
            {bundle.runs.map((r) => {
              const o = outcomeOf(focus ? claimMetrics(r, focus) : null);
              return (
                <button key={r.id} type="button" role="radio" aria-checked={state.runId === r.id} onClick={() => dispatch({ type: 'run', runId: r.id })}>
                  <i className={`side-dot side-dot--${o.tone}`} aria-hidden="true" />
                  <span>{r.title}</span>
                  <small>{o.word}</small>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {state.live && (
        <section className="side-section" aria-label="Running">
          <h2>Running</h2>
          <div className="side-live">
            {bundle && <LiveBadge provenance={bundle.provenance} status={state.live.status} steps={bundle.runs[0]?.events.length ?? 0} neo4j={state.live.neo4j} />}
            <strong>{bundle?.runs[0]?.title ?? state.live.id}</strong>
            {valid[0] && (
              <button type="button" className="text-btn" onClick={() => dispatch({ type: 'open-bundle', id: valid[0].id })}>
                Back to recorded sessions
              </button>
            )}
          </div>
        </section>
      )}

      <div className="side-foot">
        {state.live && (state.live.status === 'lost' || state.live.status === 'ended') && (
          <button type="button" className="chip-btn" onClick={() => dispatch({ type: 'open-live', id: state.live!.id })}>
            Reconnect
          </button>
        )}
        {(valid.length > 1 || live.sources.length > 0) && (
          <label className="picker">
            <span className="sr-only">Source</span>
            <select
              value={state.live ? `live:${state.live.id}` : `bundle:${state.bundleId ?? ''}`}
              onChange={(e) => {
                const [kind, ...rest] = e.target.value.split(':');
                const id = rest.join(':');
                dispatch(kind === 'live' ? { type: 'open-live', id } : { type: 'open-bundle', id });
              }}
            >
              {valid.map((b) => (
                <option key={b.id} value={`bundle:${b.id}`}>
                  {b.title}
                </option>
              ))}
              {live.sources.map((l) => (
                <option key={l.id} value={`live:${l.id}`}>
                  Live: {l.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {bundle && bundle.provenance !== 'synthetic' && !state.live && (
          <p className="side-meta" title={PROVENANCE_NOTE[bundle.provenance]}>
            {PROVENANCE_WORD[bundle.provenance]}: {bundle.source}
          </p>
        )}
        <dl className="side-model">
          <dt>Agent model</dt>
          <dd>{MODEL_RESULTS[0].model}</dd>
          <dt>Monitors</dt>
          <dd>Black-box · White-box</dd>
        </dl>
      </div>
    </aside>
  );
}

/** Says exactly what the live feed is doing; "Live" only while a stream is connected. */
function LiveBadge({ provenance, status, steps, neo4j }: { provenance: string; status: LiveState['status']; steps: number; neo4j: LiveState['neo4j'] }) {
  const words: Record<LiveState['status'], string> = {
    connecting: 'Connecting to the live run…',
    live: provenance === 'live' ? 'Live' : 'Live stream',
    quiet: 'Live, waiting for the next step',
    lost: `Live feed lost after ${steps} steps`,
    ended: `Live run ended after ${steps} steps`,
  };
  return (
    <span className={`provenance live-badge live-badge--${status}`}>
      <i aria-hidden="true" />
      {words[status]}
      {neo4j === 'synced' ? ' · Neo4j' : ''}
    </span>
  );
}
