import { useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar.tsx';
import { DecisionBadge } from '../components/DecisionBadge.tsx';
import { Inspector } from '../components/Inspector.tsx';
import { decisionOf, isAlert } from '../model/activity.ts';
import { deriveState } from '../model/replay.ts';
import type { Bundle, ReplayEvent, Run } from '../model/types.ts';
import { actorName, nodeName } from '../lib/words.ts';
import { useStore } from '../state/store.tsx';

/** The run as a log: every step, who did it, what it touched and what VETO decided, with alerts marked. */
export function ActivityView({ bundle, run }: { bundle: Bundle; run: Run }) {
  const { state, dispatch } = useStore();
  const [alertsOnly, setAlertsOnly] = useState(false);
  const rs = useMemo(() => deriveState(run, state.cursor), [run, state.cursor]);
  const rows = alertsOnly ? run.events.filter((e) => isAlert(e, run)) : run.events;
  const selected = state.selection?.kind === 'event' ? state.selection.id : null;

  const pick = (e: ReplayEvent) => {
    dispatch({ type: 'seek', cursor: e.seq });
    dispatch({ type: 'select', selection: selected === e.id ? null : { kind: 'event', id: e.id } });
  };

  return (
    <div className={`run-split ${state.selection ? 'has-detail' : ''}`}>
      <section className="dash-card log-card" aria-label="Event log">
        <label className="log-filter">
          <input type="checkbox" checked={alertsOnly} onChange={(e) => setAlertsOnly(e.target.checked)} />
          Only alerts ({run.events.filter((e) => isAlert(e, run)).length})
        </label>
        <table className="log">
          <thead>
            <tr>
              <th>#</th>
              <th>Agent</th>
              <th>What happened</th>
              <th>Tool</th>
              <th>VETO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className={`${selected === e.id ? 'is-selected' : ''} ${isAlert(e, run) ? 'is-alert' : ''}`} onClick={() => pick(e)} tabIndex={0} onKeyDown={(ev) => ev.key === 'Enter' && pick(e)}>
                <td className="num muted">{e.seq + 1}</td>
                <td>
                  <span className="log-who">
                    <Avatar run={run} actorId={e.actor} size={26} />
                    {actorName(run, e.actor)}
                  </span>
                </td>
                <td>
                  {e.summary}
                  {e.target && <small className="log-target">→ {nodeName(run, e.target)}</small>}
                </td>
                <td>{e.tool ? <code>{e.tool.name}</code> : <span className="muted">–</span>}</td>
                <td>
                  <DecisionBadge decision={decisionOf(e, run)} />
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="muted">
                  No alerts in this run.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      {state.selection && <Inspector bundle={bundle} run={run} state={rs} className="run-detail" />}
    </div>
  );
}
