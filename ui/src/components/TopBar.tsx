import type { Bundle } from '../model/types.ts';
import { PROVENANCE_NOTE, PROVENANCE_WORD } from '../lib/words.ts';
import { useStore, type View } from '../state/store.tsx';

const VIEWS: { id: View; label: string; key: string }[] = [
  { id: 'replay', label: 'Story', key: '1' },
  { id: 'compare', label: 'Compare', key: '2' },
  { id: 'graph', label: 'Data', key: '3' },
];

export function TopBar({ bundle }: { bundle: Bundle | null }) {
  const { state, dispatch } = useStore();
  const valid = state.bundles?.filter((b) => !b.problems.length) ?? [];
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
      {bundle && (
        <div className="topbar-right glass">
          <span className={`provenance provenance--${bundle.provenance}`} title={PROVENANCE_NOTE[bundle.provenance]}>
            <i aria-hidden="true" />
            {PROVENANCE_WORD[bundle.provenance]}
            <span className="provenance-note">{bundle.provenance === 'synthetic' ? 'not real research data' : bundle.source}</span>
          </span>
          {valid.length > 1 && (
            <label className="picker">
              <span className="sr-only">Dataset</span>
              <select value={state.bundleId ?? ''} onChange={(e) => dispatch({ type: 'open-bundle', id: e.target.value })}>
                {valid.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} ({PROVENANCE_WORD[b.provenance].toLowerCase()})
                  </option>
                ))}
              </select>
            </label>
          )}
          {state.view !== 'home' && <label className="picker">
            <span className="sr-only">Run</span>
            <select value={state.runId ?? ''} onChange={(e) => dispatch({ type: 'run', runId: e.target.value })}>
              {bundle.runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>}
        </div>
      )}
    </header>
  );
}
