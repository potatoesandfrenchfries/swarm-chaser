import type { Bundle } from '../model/types.ts';
import { PROVENANCE_NOTE, PROVENANCE_WORD } from '../lib/words.ts';
import { useStore, type LiveState, type View } from '../state/store.tsx';
import { useLiveSources } from '../state/live.ts';

const VIEWS: { id: View; label: string; key: string }[] = [
  { id: 'replay', label: 'Story', key: '1' },
  { id: 'compare', label: 'Compare', key: '2' },
  { id: 'graph', label: 'Data', key: '3' },
];

export function TopBar({ bundle }: { bundle: Bundle | null }) {
  const { state, dispatch } = useStore();
  const valid = state.bundles?.filter((b) => !b.problems.length) ?? [];
  const live = useLiveSources();
  const showProvenance = Boolean(state.live) || bundle?.provenance !== 'synthetic';
  const showReconnect = Boolean(state.live && (state.live.status === 'lost' || state.live.status === 'ended'));
  const showSource = valid.length > 1 || live.sources.length > 0;
  const showRun = Boolean(bundle && state.view !== 'home' && !state.live && bundle.runs.length > 1);
  return (
    <header className="topbar">
      <div className="topbar-left glass">
        <button type="button" className="wordmark" onClick={() => dispatch({ type: 'view', view: 'home' })} aria-label="claim-spread, home">
          claim-spread
        </button>
        <nav className="views" aria-label="Views">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className={state.view === v.id ? 'is-active' : ''} aria-current={state.view === v.id ? 'page' : undefined} onClick={() => dispatch({ type: 'view', view: v.id })} title={`${v.label} (${v.key})`}>
              {v.label}
            </button>
          ))}
        </nav>
      </div>
      {bundle && (showProvenance || showReconnect || showSource || showRun) && (
        <div className="topbar-right glass">
          {state.live ? (
            <LiveBadge provenance={bundle.provenance} status={state.live.status} steps={bundle.runs[0]?.events.length ?? 0} neo4j={state.live.neo4j} />
          ) : (
            showProvenance && (
              <span className={`provenance provenance--${bundle.provenance}`} title={PROVENANCE_NOTE[bundle.provenance]}>
                <i aria-hidden="true" />
                {PROVENANCE_WORD[bundle.provenance]}
                <span className="provenance-note">{bundle.source}</span>
              </span>
            )
          )}
          {showReconnect && (
            <>
              <button type="button" className="chip-btn" onClick={() => dispatch({ type: 'open-live', id: state.live!.id })}>
                Reconnect
              </button>
              {valid[0] && (
                <button type="button" className="chip-btn" onClick={() => dispatch({ type: 'open-bundle', id: valid[0].id })}>
                  Use the made-up example
                </button>
              )}
            </>
          )}
          {showSource && (
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
                {state.live && !live.sources.some((l) => l.id === state.live!.id) && <option value={`live:${state.live.id}`}>Live: {state.live.id}</option>}
              </select>
            </label>
          )}
          {showRun && (
            <label className="picker">
              <span className="sr-only">Run</span>
              <select value={state.runId ?? ''} onChange={(e) => dispatch({ type: 'run', runId: e.target.value })}>
                {bundle.runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </header>
  );
}

/** Says exactly what the live feed is doing; "Live" only while a stream is connected. */
function LiveBadge({ provenance, status, steps, neo4j }: { provenance: string; status: LiveState['status']; steps: number; neo4j: LiveState['neo4j'] }) {
  const words: Record<LiveState['status'], string> = {
    connecting: 'Connecting to the live run…',
    live: provenance === 'live' ? 'Live' : 'Live stream',
    quiet: 'Live, waiting for the next step',
    lost: `Live feed lost, showing the ${steps} steps that arrived`,
    ended: `Live run ended after ${steps} steps`,
  };
  return (
    <span className={`provenance live-badge live-badge--${status}`} title={provenance === 'live' ? 'Events from a running agent system' : 'The made-up example streamed step by step to rehearse the live view'}>
      <i aria-hidden="true" />
      {words[status]}
      <span className="provenance-note">
        {provenance === 'live' ? 'real agents' : 'simulated from the made-up example'}
        {neo4j === 'synced' ? ', copied to Neo4j' : neo4j === 'failed' ? ', Neo4j copy failed' : ''}
      </span>
    </span>
  );
}
