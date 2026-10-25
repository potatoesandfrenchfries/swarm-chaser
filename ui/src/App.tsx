import { lazy, Suspense, useEffect } from 'react';
import syntheticBundle from '../data/synthetic/merch-launch.json';
import { TopBar } from './components/TopBar.tsx';
import type { Bundle } from './model/types.ts';
import { usePlayback } from './state/hooks.ts';
import { useLiveConnection } from './state/live.ts';
import { currentRun, useStore } from './state/store.tsx';
import { CompareView } from './views/CompareView.tsx';
import { HomeView } from './views/HomeView.tsx';
import { ReplayView } from './views/ReplayView.tsx';

const ExplorerView = lazy(() => import('./views/ExplorerView.tsx'));

export function App() {
  const { state, dispatch } = useStore();
  usePlayback();
  useLiveConnection();
  const run = currentRun(state);
  const bundle = state.bundle;
  const viewRef = state.view;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : document.body;
      if (e.altKey || e.ctrlKey || e.metaKey || t.closest('input:not([type=range]), select, textarea, [contenteditable=true]')) return;
      // Playback keys belong to the replay views, not the landing page.
      if (viewRef === 'home' && e.key !== '1' && e.key !== '2' && e.key !== '3') return;
      const inRange = t.matches('input[type=range]');
      if (e.key === ' ' && !t.closest('button, summary, a')) {
        e.preventDefault();
        dispatch({ type: 'toggle' });
      } else if (e.key === 'ArrowRight' && !inRange) {
        e.preventDefault();
        dispatch({ type: 'step', delta: 1 });
      } else if (e.key === 'ArrowLeft' && !inRange) {
        e.preventDefault();
        dispatch({ type: 'step', delta: -1 });
      } else if (e.key === 'Home' && !inRange) dispatch({ type: 'seek', cursor: -1 });
      else if (e.key === 'End' && !inRange && run) dispatch({ type: 'seek', cursor: run.events.length - 1 });
      else if (e.key === 'Escape') dispatch({ type: 'select', selection: null });
      else if (e.key === '1') dispatch({ type: 'view', view: 'replay' });
      else if (e.key === '2') dispatch({ type: 'view', view: 'compare' });
      else if (e.key === '3') dispatch({ type: 'view', view: 'graph' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, run, viewRef]);

  return (
    <div className={state.view === 'home' ? 'app app--academia' : 'app'}>
      {state.view !== 'home' && <TopBar bundle={bundle} />}
      {bundle && run ? (
        state.view === 'home' ? (
          <HomeView bundle={bundle} />
        ) : state.view === 'replay' ? (
          <ReplayView bundle={bundle} run={run} />
        ) : state.view === 'compare' ? (
          <CompareView bundle={bundle} />
        ) : (
          <Suspense fallback={<div className="center-state">Preparing the graph explorer…</div>}>
            <ExplorerView bundle={bundle} run={run} />
          </Suspense>
        )
      ) : (
        <LoadState />
      )}
    </div>
  );
}

/** Loading, empty and failure states. The synthetic demo is offered by name; it never replaces real data silently. */
function LoadState() {
  const { state, dispatch } = useStore();
  const openSynthetic = () => dispatch({ type: 'bundle-loaded', bundle: syntheticBundle as Bundle });
  if (state.listError || state.bundleError) {
    return (
      <div className="center-state" role="alert">
        <h1>{state.listError ? 'The app could not reach its server.' : 'This example could not be opened.'}</h1>
        <p>{state.listError ?? state.bundleError}</p>
        <p className="muted">Start it with npm run dev in ui/. Or open the built-in made-up example, which works without the server.</p>
        <button type="button" className="btn" onClick={openSynthetic}>
          Open the made-up example
        </button>
      </div>
    );
  }
  if (state.bundles && !state.bundles.some((b) => !b.problems.length)) {
    return (
      <div className="center-state">
        <h1>No usable dataset found.</h1>
        <ul className="problems">
          {state.bundles.map((b) => (
            <li key={b.file}>
              <code>{b.file}</code>: {b.problems.join(' ')}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="center-state" aria-busy="true">
      <p>Loading the replay…</p>
    </div>
  );
}
