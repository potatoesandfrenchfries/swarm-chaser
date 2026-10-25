import { Avatar } from '../components/Avatar.tsx';
import { DecisionBadge } from '../components/DecisionBadge.tsx';
import { PageHead } from '../components/PageHead.tsx';
import { decisionOf, hasMonitor, isAlert, isToolCall, type Decision } from '../model/activity.ts';
import { claimMetrics, focusClaimOf, outcomeOf } from '../model/metrics.ts';
import { HEADLINE, MODEL_RESULTS } from '../model/results.ts';
import type { Bundle, Run } from '../model/types.ts';
import { actorName } from '../lib/words.ts';
import { useStore } from '../state/store.tsx';

/** Segments of the per-session bar, in the order an operator reads them: stopped, passed, unchecked. */
const BAR: { decision: Decision; label: string }[] = [
  { decision: 'blocked', label: 'Blocked' },
  { decision: 'allowed', label: 'Allowed' },
  { decision: 'ran', label: 'Ran unchecked' },
  { decision: 'leaked', label: 'Leaked' },
];

/** Every session in the open dataset at a glance: totals, what needs attention, and how each session ended. */
export function OverviewView({ bundle }: { bundle: Bundle }) {
  const { dispatch } = useStore();
  const focus = focusClaimOf(bundle);
  const all = bundle.runs.flatMap((r) => r.events.map((e) => ({ run: r, e })));
  const count = (d: Decision) => all.filter(({ e }) => decisionOf(e) === d).length;
  const agents = Math.max(...bundle.runs.map((r) => r.actors.filter((a) => a.kind === 'agent').length));
  const alerts = all.filter(({ e }) => isAlert(e));
  const open = (run: Run, seq?: number, id?: string) => {
    dispatch({ type: 'run', runId: run.id, cursor: seq });
    if (id) dispatch({ type: 'select', selection: { kind: 'event', id } });
    dispatch({ type: 'view', view: 'activity' });
  };

  return (
    <main className="page">
      <PageHead title="Overview" sub={bundle.title} />

      <section className="dash-kpis" aria-label="Totals">
        <Stat value={bundle.runs.length} label="Sessions" />
        <Stat value={agents} label="Agents" />
        <Stat value={all.filter(({ e }) => isToolCall(e)).length} label="Tool calls" />
        <Stat value={count('blocked')} label="Blocked" tone="good" />
        <Stat value={count('leaked')} label="Leaked" tone="bad" />
      </section>

      <div className="page-grid">
        <section className="dash-card" aria-label="Alerts">
          <h2>
            Alerts <span className="count-pill">{alerts.length}</span>
          </h2>
          <ul className="alert-list">
            {alerts.map(({ run, e }) => (
              <li key={`${run.id}-${e.id}`}>
                <button type="button" onClick={() => open(run, e.seq, e.id)}>
                  <Avatar run={run} actorId={e.actor} size={30} />
                  <span className="alert-text">
                    <strong>{e.summary}</strong>
                    <small>
                      {run.title} · step {e.seq + 1} · {actorName(run, e.actor)}
                    </small>
                  </span>
                  <DecisionBadge decision={decisionOf(e)} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="dash-card" aria-label="Monitors">
          <h2>Monitors</h2>
          <ul className="monitor-list">
            <li>
              <span className="status-dot status-dot--on" aria-hidden="true" />
              <div>
                <strong>Black-box</strong>
                <small>Reads messages and tool calls · AUC {HEADLINE.blackboxAuc.toFixed(2)}</small>
              </div>
            </li>
            <li>
              <span className="status-dot status-dot--on" aria-hidden="true" />
              <div>
                <strong>White-box</strong>
                <small>
                  Reads activations of {MODEL_RESULTS[0].model} · AUC {HEADLINE.whiteboxAuc.toFixed(2)}
                </small>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <section className="dash-card" aria-label="Sessions">
        <h2>Sessions</h2>
        <table className="dash-table dash-table--rows">
          <thead>
            <tr>
              <th>Session</th>
              <th>VETO</th>
              <th>Steps</th>
              <th>Tool calls</th>
              <th className="wide">Actions</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {bundle.runs.map((r) => {
              const o = outcomeOf(focus ? claimMetrics(r, focus) : null);
              const calls = r.events.filter((e) => BAR.some((b) => b.decision === decisionOf(e)));
              return (
                <tr key={r.id} onClick={() => open(r)} tabIndex={0} onKeyDown={(ev) => ev.key === 'Enter' && open(r)}>
                  <td>
                    <strong>{r.title}</strong>
                  </td>
                  <td>{hasMonitor(r) ? <span className="on-pill">On</span> : <span className="off-pill">Off</span>}</td>
                  <td className="num">{r.events.length}</td>
                  <td className="num">{r.events.filter(isToolCall).length}</td>
                  <td className="wide">
                    <div className="stack-bar" aria-label={BAR.map((b) => `${b.label} ${calls.filter((e) => decisionOf(e) === b.decision).length}`).join(', ')}>
                      {BAR.map((b) => {
                        const n = calls.filter((e) => decisionOf(e) === b.decision).length;
                        return n ? <span key={b.decision} className={`stack-seg stack-seg--${b.decision}`} style={{ flexGrow: n }} title={`${b.label}: ${n}`} /> : null;
                      })}
                    </div>
                  </td>
                  <td>
                    <span className={`outcome outcome--${o.tone}`}>{o.word}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="legend-row">
          {BAR.map((b) => (
            <span key={b.decision}>
              <i className={`stack-key stack-seg--${b.decision}`} /> {b.label}
            </span>
          ))}
        </p>
      </section>
    </main>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'good' | 'bad' }) {
  return (
    <div className={`kpi ${tone ? `kpi--${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
