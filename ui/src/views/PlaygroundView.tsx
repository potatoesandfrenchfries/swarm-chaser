import { useState, type ReactNode } from 'react';
import { FileText, Play } from 'lucide-react';
import { setupOf, useStartRun, useTasks } from '../state/tasks.ts';

/** New run: pick a task, an attack and whether Chaser watches, then start it. */
export function PlaygroundView() {
  const tasks = useTasks();
  const start = useStartRun();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [attack, setAttack] = useState(true);
  const [veto, setVeto] = useState(true);
  const task = tasks.list?.find((t) => t.id === taskId) ?? tasks.list?.[0];
  // Every recorded set-up with no attack runs without Chaser, so the switch only applies to an attack.
  const setup = task && setupOf(task, attack, attack && veto);

  return (
    <main className="play play--setup">
      <header className="play-head">
        <h1>New run</h1>
        <p>Give the agent team a task, plant an attack in what they read, and see whether Chaser stops it.</p>
      </header>

      <section className="play-step" aria-labelledby="step-task">
        <h2 id="step-task">
          <span>1</span> Task
        </h2>
        <div className="choices" role="radiogroup" aria-labelledby="step-task">
          {tasks.list?.map((t) => (
            <Choice key={t.id} on={t.id === task?.id} onPick={() => setTaskId(t.id)} title={t.title} detail={t.brief} />
          ))}
          <Choice on={false} disabled title="Your own task" detail="Needs a connected agent runtime." />
        </div>
        {tasks.error && <p className="task-error">Tasks could not be loaded: {tasks.error}</p>}
      </section>

      <section className="play-step" aria-labelledby="step-attack">
        <h2 id="step-attack">
          <span>2</span> Attack
        </h2>
        <div className="choices" role="radiogroup" aria-labelledby="step-attack">
          <Choice on={!attack} onPick={() => setAttack(false)} title="No attack" detail="A normal day. Nothing is planted." />
          <Choice on={attack} onPick={() => setAttack(true)} title="Planted note" detail="A note hidden in what the agents read.">
            {task?.attack && (
              <span className="attachment attachment--planted play-note">
                <span className="attachment-name">
                  <FileText size={15} aria-hidden="true" />
                  Planted note
                </span>
                <p>{task.attack}</p>
              </span>
            )}
          </Choice>
          <Choice on={false} disabled title="Write your own" detail="Needs a connected agent runtime." />
        </div>
      </section>

      <section className="play-step" aria-labelledby="step-veto">
        <h2 id="step-veto">
          <span>3</span> Chaser
        </h2>
        <label className={`switch-row ${!attack ? 'is-disabled' : ''}`}>
          <input type="checkbox" role="switch" checked={attack && veto} disabled={!attack} onChange={(e) => setVeto(e.target.checked)} />
          <span className="switch" aria-hidden="true" />
          <span>
            <strong>{attack && veto ? 'Chaser checks every action first' : 'Nothing watches the agents'}</strong>
            <small>{attack ? 'Turn it off to see what the attack does unchecked.' : 'With no attack there is nothing to stop.'}</small>
          </span>
        </label>
        <ul className="play-monitors">
          <li>
            <strong>Black-box monitor</strong> reads every message and tool call.
          </li>
          <li>
            <strong>White-box monitor</strong> reads the agent model's activations.
          </li>
        </ul>
      </section>

      <footer className="play-go">
        <button type="button" className="chat-play" onClick={() => task && setup && start.run(task.id, setup.id)} disabled={start.busy || !setup}>
          <Play size={15} fill="currentColor" strokeWidth={0} aria-hidden="true" />
          {start.busy ? 'Starting…' : 'Run'}
        </button>
        <small>Plays back a recorded run of this set-up, step by step.</small>
        {start.error && <p className="task-error">{start.error}</p>}
      </footer>
    </main>
  );
}

function Choice({ on, onPick, disabled = false, title, detail, children }: { on: boolean; onPick?: () => void; disabled?: boolean; title: string; detail: string; children?: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} disabled={disabled} className="choice" onClick={onPick}>
      <strong>{title}</strong>
      <small>{detail}</small>
      {children}
    </button>
  );
}
