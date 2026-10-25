import { ArrowRight } from 'lucide-react';
import { DecisionBadge } from '../components/DecisionBadge.tsx';
import { PageHead } from '../components/PageHead.tsx';
import { Pager, usePage } from '../components/Pager.tsx';
import { SetupTags } from '../components/SetupTags.tsx';
import type { Decision } from '../model/activity.ts';
import { setupWords } from '../lib/words.ts';
import { useRuns, type RunRow } from '../state/runs.ts';
import { useStore } from '../state/store.tsx';

const PAGE = 5;
/** Which alert stands for a run in the list: a leak matters more than a block, a block more than a flag. */
const SEVERITY: Decision[] = ['leaked', 'blocked', 'flagged'];

/** Every run on this server: does VETO stop the attacks, which runs need a look, and how each one ended. */
export function OverviewView() {
  const { dispatch } = useStore();
  const { rows, error } = useRuns();
  const done = rows.filter((r) => !r.status && r.digest.attack);
  const tally = (veto: boolean, tone: 'good' | 'bad') => {
    const rs = done.filter((r) => r.digest.veto === veto);
    return { hit: rs.filter((r) => r.digest.outcome.tone === tone).length, of: rs.length };
  };
  const on = tally(true, 'good');
  const off = tally(false, 'bad');
  const flagged = rows.filter((r) => r.digest.alerts.length);
  const alertPage = usePage(flagged, PAGE);
  const runPage = usePage(rows, PAGE);

  const openRun = (r: RunRow, view: 'chat' | 'activity' = 'chat') => {
    if (!r.open) return;
    dispatch({ type: 'view', view });
    dispatch(r.open);
  };

  return (
    <main className="page">
      <PageHead title="Overview" />
      {error && <p className="task-error">{error}</p>}

      <section className="dash-kpis" aria-label="Does VETO work">
        <div className="kpi kpi--good">
          <span className="kpi-label">With VETO</span>
          <strong>
            {on.hit}
            <small> of {on.of}</small>
          </strong>
          <span>attacks blocked</span>
        </div>
        <div className="kpi kpi--bad">
          <span className="kpi-label">Without VETO</span>
          <strong>
            {off.hit}
            <small> of {off.of}</small>
          </strong>
          <span>attacks leaked</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">All runs</span>
          <strong>{rows.length}</strong>
          <span>{rows.filter((r) => r.status === 'Running').length} running now</span>
        </div>
      </section>

      <section className="dash-card" aria-label="Alerts">
        <header className="card-head">
          <h2>
            Needs a look <span className="count-pill">{flagged.length}</span>
          </h2>
          <Pager p={alertPage} label="Alerts" />
        </header>
        {!flagged.length && <p className="muted">Nothing was blocked, flagged or leaked yet.</p>}
        <ul className="alert-list">
          {alertPage.slice.map((r) => {
            const worst = SEVERITY.map((d) => r.digest.alerts.find((a) => a.decision === d)).find(Boolean);
            if (!worst) return null;
            const more = r.digest.alerts.length - 1;
            return (
              <li key={r.key}>
                <button type="button" onClick={() => openRun(r, 'activity')}>
                  <DecisionBadge decision={worst.decision} />
                  <span className="alert-text">
                    <strong>{worst.summary}</strong>
                    <small>
                      {r.when} · {setupWords(r.digest)} · step {worst.seq + 1}
                      {more > 0 && ` · ${more} more`}
                    </small>
                  </span>
                  <ArrowRight size={16} className="alert-go" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="dash-card" aria-label="Runs">
        <header className="card-head">
          <h2>Runs</h2>
          <div className="card-tools">
            <Pager p={runPage} label="Runs" />
          </div>
        </header>
        <table className="dash-table dash-table--rows">
          <thead>
            <tr>
              <th>When</th>
              <th>Set-up</th>
              <th>Steps</th>
              <th>Alerts</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {runPage.slice.map((r) => (
              <tr
                key={r.key}
                className={r.open ? '' : 'is-static'}
                onClick={() => openRun(r)}
                tabIndex={r.open ? 0 : undefined}
                onKeyDown={(ev) => ev.key === 'Enter' && openRun(r)}
              >
                <td>
                  <strong>{r.when}</strong>
                </td>
                <td>
                  <span className="play-tags">
                    <SetupTags attack={r.digest.attack} veto={r.digest.veto} />
                  </span>
                </td>
                <td className="num">{r.steps ?? <span className="muted">–</span>}</td>
                <td className="num">{r.digest.alerts.length || <span className="muted">–</span>}</td>
                <td>
                  <span className={`outcome outcome--${r.status ? 'calm' : r.digest.outcome.tone}`}>{r.status ?? r.digest.outcome.word}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="muted">
            No runs yet.{' '}
            <button type="button" className="text-btn" onClick={() => dispatch({ type: 'new-run' })}>
              Start one
            </button>
          </p>
        )}
      </section>
    </main>
  );
}
