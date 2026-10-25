import { Button } from './ui/button.tsx';
import { useStore, type View } from '../state/store.tsx';

const PAGES: { view: View; label: string }[] = [
  { view: 'home', label: 'Product' },
  { view: 'demo', label: 'Demo' },
  { view: 'results', label: 'Results' },
];

/** The landing site's header: its pages on the left, the way into the dashboard on the right. */
export function SiteHeader() {
  const { state, dispatch } = useStore();
  return (
    <header className="acad-header">
      <div className="acad-header__inner">
        <button type="button" className="acad-logo" onClick={() => dispatch({ type: 'view', view: 'home' })}>
          VETO
        </button>
        <nav className="acad-nav" aria-label="Pages">
          {PAGES.map((p) => (
            <button key={p.view} type="button" className={state.view === p.view ? 'is-active' : ''} aria-current={state.view === p.view ? 'page' : undefined} onClick={() => dispatch({ type: 'view', view: p.view })}>
              {p.label}
            </button>
          ))}
        </nav>
        <Button type="button" onClick={() => dispatch({ type: 'view', view: 'overview' })}>
          Open dashboard
        </Button>
      </div>
    </header>
  );
}
