import { LayoutDashboard, Plus } from 'lucide-react';
import { useStore } from '../state/store.tsx';

/** The dashboard's frame: start a run, or go to the overview, which lists every run. */
export function Sidebar() {
  const { state, dispatch } = useStore();
  return (
    <aside className="sidebar" aria-label="App">
      <button type="button" className="wordmark" onClick={() => dispatch({ type: 'view', view: 'home' })} aria-label="VETO, home">
        VETO
      </button>
      <button type="button" className="new-task-btn" aria-current={state.view === 'playground' ? 'page' : undefined} onClick={() => dispatch({ type: 'new-run' })}>
        <Plus size={16} aria-hidden="true" />
        New run
      </button>
      <nav className="side-nav" aria-label="Pages">
        <button type="button" className={state.view === 'overview' ? 'is-active' : ''} aria-current={state.view === 'overview' ? 'page' : undefined} onClick={() => dispatch({ type: 'view', view: 'overview' })}>
          <LayoutDashboard size={17} aria-hidden="true" />
          Overview
        </button>
      </nav>
    </aside>
  );
}
