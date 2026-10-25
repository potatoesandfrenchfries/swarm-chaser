import { useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar.tsx';
import { DecisionBadge } from '../components/DecisionBadge.tsx';
import { Inspector } from '../components/Inspector.tsx';
import { PageHead } from '../components/PageHead.tsx';
import { decisionOf, hasMonitor, isAlert, isToolCall } from '../model/activity.ts';
import { claimMetrics, focusClaimOf, outcomeOf } from '../model/metrics.ts';
import { deriveState } from '../model/replay.ts';
import type { Bundle, ReplayEvent, Run } from '../model/types.ts';
import { actorName, nodeName } from '../lib/words.ts';
import { useStore } from '../state/store.tsx';

const FILTERS = [
  { id: 'all', label: 'All', keep: () => true },
  { id: 'alerts', label: 'Alerts', keep: isAlert },
  { id: 'tools', label: 'Tool calls', keep: isToolCall },
  { id: 'veto', label: 'VETO', keep: (e: ReplayEvent, run: Run) => run.actors.find((a) => a.id === e.actor)?.kind === 'monitor' },
] as const;

/** One session as an event log: every step, who did it, what it touched and what VETO decided. */
export function ActivityView({ bundle, run }: { bundle: Bundle; run: Run }) {
  const { state, dispatch } = useStore();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const rs = useMemo(() => deriveState(run, state.cursor), [run, state.cursor]);
  const focus = focusClaimOf(bundle);
  // A live run has no outcome until it stops; until then it is simply running.
  const running = state.live && (state.live.status === 'connecting' || state.live.status === 'live' || state.live.status === 'quiet');
  const outcome = running ? { word: 'Running', tone: 'calm' as const } : outcomeOf(focus ? claimMetrics(run, focus) : null);
  const keep = FILTERS.find((f) => f.id === filter)!.keep;
  const rows = run.events.filter((e) => keep(e, run));
  const selected = state.selection?.kind === 'event' ? state.selection.id : null;

  const pick = (e: ReplayEvent) => {
    dispatch({ type: 'seek', cursor: e.seq });
    dispatch({ type: 'select', selection: { kind: 'event', id: e.id } });
  };

  return (
    <main className="page page--split">
      <div className="page-main">
        <PageHead
          title={run.title}
          sub={
            <>
              <span className={`outcome outcome--${outcome.tone}`}>{outcome.word}</span>
              <span>{run.events.length} steps</span>
              <span>VETO {hasMonitor(run) ? 'on' : 'off'}</span>
            </>
          }
        >
          <div className="runs" role="radiogroup" aria-label="Filter">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </PageHead>

        <section className="dash-card log-card" aria-label="Event log">
          <table className="log">
            <thead>
              <tr>
                <th>#</th>
                <th>Agent</th>
                <th>Event</th>
                <th>Tool</th>
                <th>VETO</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className={`${selected === e.id ? 'is-selected' : ''} ${isAlert(e) ? 'is-alert' : ''}`} onClick={() => pick(e)} tabIndex={0} onKeyDown={(ev) => ev.key === 'Enter' && pick(e)}>
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
                    <DecisionBadge decision={decisionOf(e)} />
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    Nothing matches this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
      <Inspector bundle={bundle} run={run} state={rs} className="side-inspector" />
    </main>
  );
}
