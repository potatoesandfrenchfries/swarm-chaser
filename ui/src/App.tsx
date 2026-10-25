import { useEffect } from 'react';
import syntheticBundle from '../data/synthetic/merch-launch.json';
import { SiteHeader } from './components/SiteHeader.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import type { Bundle } from './model/types.ts';
import { useLiveConnection } from './state/live.ts';
import { SITE_VIEWS, currentRun, useStore } from './state/store.tsx';
import { DemoView } from './views/DemoView.tsx';
import { LandingView } from './views/LandingView.tsx';
import { OverviewView } from './views/OverviewView.tsx';
import { PlaygroundView } from './views/PlaygroundView.tsx';
import { ResultsView } from './views/ResultsView.tsx';
import { SettingsView } from './views/SettingsView.tsx';
import { RunView } from './views/RunView.tsx';

export function App() {
  const { state, dispatch } = useStore();
  useLiveConnection();
  const bundle = state.bundle;
  const run = currentRun(state);
  const viewRef = state.view;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The landing site is read, not operated; in the dashboard Escape closes a step's detail.
      if (SITE_VIEWS.includes(viewRef) || e.key !== 'Escape') return;
      dispatch({ type: 'select', selection: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, viewRef]);

  if (SITE_VIEWS.includes(state.view)) {
    return (
      <div className="acad-page">
        <SiteHeader />
        {bundle ? state.view === 'home' ? <LandingView bundle={bundle} /> : state.view === 'demo' ? <DemoView bundle={bundle} /> : <ResultsView bundle={bundle} /> : <LoadState />}
      </div>
    );
  }

  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-main">
        {state.view === 'overview' ? <OverviewView /> : state.view === 'playground' ? <PlaygroundView /> : state.view === 'settings' ? <SettingsView /> : bundle && run ? <RunView bundle={bundle} run={run} /> : <LoadState />}
      </div>
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
