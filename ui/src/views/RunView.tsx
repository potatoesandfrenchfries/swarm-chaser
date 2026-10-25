import { useEffect, useMemo, useRef } from 'react';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import type { TaskInfo } from '../../server/api.ts';
import { ChatMessage } from '../components/ChatMessage.tsx';
import { SetupTags } from '../components/SetupTags.tsx';
import { Inspector } from '../components/Inspector.tsx';
import { digestRun } from '../model/activity.ts';
import { claimMetrics, focusClaimOf, outcomeOf } from '../model/metrics.ts';
import { deriveState } from '../model/replay.ts';
import type { Bundle, Run } from '../model/types.ts';
import { useReducedMotion } from '../state/hooks.ts';
import { useStore, type View } from '../state/store.tsx';
import { setupOf, useStartRun, useTasks, type Setup, type StartRun } from '../state/tasks.ts';
import { ActivityView } from './ActivityView.tsx';

import { NetworkView } from './NetworkView.tsx';

const TABS: { view: View; label: string }[] = [
  { view: 'chat', label: 'Chat' },
  { view: 'activity', label: 'Log' },
  { view: 'graph', label: 'Graph' },
];

/** One run: what was set up, how it ended, and the run itself as a chat, a log or a graph. */
export function RunView({ bundle, run }: { bundle: Bundle; run: Run }) {
  const { state, dispatch } = useStore();
  const tasks = useTasks();
  const start = useStartRun();
  const live = state.live;
  // A live run names its task; a recorded example belongs to the task that replays it.
  const task = tasks.list?.find((t) => (live ? t.id === live.task?.id : t.bundle === bundle.id)) ?? null;
  const setup = task?.setups.find((s) => s.id === (live ? live.task?.setup : run.id)) ?? null;
  const running = Boolean(live && (live.status === 'connecting' || live.status === 'live' || live.status === 'quiet'));
  const digest = useMemo(() => digestRun(bundle, run), [bundle, run]);

  return (
    <main className="run">
      <header className="run-head">
        <div>
          <h1>{task?.title ?? run.title}</h1>
          <p className="play-tags">
            {!live && <span className="tag">Example</span>}
            <SetupTags attack={digest.attack} veto={digest.veto} />
            <span className={`outcome outcome--${running ? 'calm' : digest.outcome.tone}`}>{running ? 'Running' : digest.outcome.word}</span>
            <span className="muted">{run.events.length} steps</span>
          </p>
        </div>
        <div className="runs" role="tablist" aria-label="View">
          {TABS.map((t) => (
            <button key={t.view} type="button" role="tab" aria-selected={state.view === t.view} onClick={() => dispatch({ type: 'view', view: t.view })}>
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <div className="run-body">
        {state.view === 'chat' ? (
          <ChatTab bundle={bundle} run={run} running={running} task={task} setup={setup} start={start} />
        ) : state.view === 'activity' ? (
          <ActivityView bundle={bundle} run={run} />
        ) : (
          <NetworkView bundle={bundle} run={run} />
        )}
      </div>
    </main>
  );
}

/** The run as the agents' group chat. Click a message for what it was based on and what it led to. */
function ChatTab({ bundle, run, running, task, setup, start }: { bundle: Bundle; run: Run; running: boolean; task: TaskInfo | null; setup: Setup | null; start: StartRun }) {
  const { state, dispatch } = useStore();
  const reduced = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const n = run.events.length;
  const selected = state.selection?.kind === 'event' ? state.selection.id : null;
  const rs = useMemo(() => deriveState(run, state.cursor), [run, state.cursor]);

  useEffect(() => {
    const el = scroller.current;
    if (el && !selected) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [n, running, selected, reduced]);

  return (
    <div className={`run-split ${selected ? 'has-detail' : ''}`}>
      <section className="chat play-chat" aria-label="Chat">
        <div className="chat-body" ref={scroller}>
          <ol className="chat-log" aria-live="polite">
            {run.events.map((e) => (
              <ChatMessage
                key={e.id}
                e={e}
                run={run}
                selected={selected === e.id}
                onSelect={() => {
                  dispatch({ type: 'seek', cursor: e.seq });
                  dispatch({ type: 'select', selection: selected === e.id ? null : { kind: 'event', id: e.id } });
                }}
              />
            ))}
          </ol>
          {running && (
            <p className="chat-typing">
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {state.live?.status === 'quiet' ? 'Waiting for the next step' : 'The agents are working'}
            </p>
          )}
          {state.live?.status === 'lost' && <p className="notice">The live feed was lost after {n} steps. What arrived is kept.</p>}
          {!running && state.live?.status !== 'lost' && <Verdict bundle={bundle} run={run} task={task} setup={setup} start={start} />}
        </div>
      </section>
      {selected && <Inspector bundle={bundle} run={run} state={rs} className="run-detail" />}
    </div>
  );
}

/** How the run ended, in one line, with the same run offered again with one thing changed. */
function Verdict({ bundle, run, task, setup, start }: { bundle: Bundle; run: Run; task: TaskInfo | null; setup: Setup | null; start: StartRun }) {
  const { dispatch } = useStore();
  const focus = focusClaimOf(bundle);
  const m = focus ? claimMetrics(run, focus) : null;
  const o = outcomeOf(m);
  const step = (id: string | undefined) => run.events.find((e) => e.id === id);
  const leak = step(m?.gotThrough[0]);
  const block = step(m?.diverted[0]);
  // The one change worth trying next: protect a leak, unprotect a block, attack a normal day.
  const next = task && setup && (o.tone === 'bad' ? setupOf(task, true, true) : o.tone === 'good' ? setupOf(task, true, false) : setup.attack ? undefined : setupOf(task, true, false));
  const nextLabel = o.tone === 'bad' ? 'Run again with VETO' : o.tone === 'good' ? 'Run again without VETO' : 'Now plant the attack';

  return (
    <div className={`chat-end chat-end--${o.tone}`} role="status">
      {o.tone === 'bad' ? <TriangleAlert size={24} aria-hidden="true" /> : <ShieldCheck size={24} aria-hidden="true" />}
      <div>
        <strong>{o.tone === 'calm' && !m?.present ? 'Nothing to stop' : o.word}</strong>
        <span>
          {leak
            ? `Step ${leak.seq + 1}: ${leak.summary} Nothing stopped it.`
            : block
              ? `Step ${block.seq + 1}: ${block.summary} The safe work still went through.`
              : m?.present
                ? 'The attack was planted, but no agent acted on it.'
                : 'No attack was planted, and the team finished the task.'}
        </span>
      </div>
      {next && (
        <button type="button" onClick={() => start.run(task.id, next.id)} disabled={start.busy}>
          {nextLabel}
        </button>
      )}
      <button type="button" className="chat-end-ghost" onClick={() => dispatch({ type: 'new-run' })}>
        New run
      </button>
      {start.error && <p className="task-error">{start.error}</p>}
    </div>
  );
}
