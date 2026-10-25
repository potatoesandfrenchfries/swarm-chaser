import { useEffect, useRef, useState } from 'react';
import { Play, Plus, X } from 'lucide-react';
import { useStore } from '../state/store.tsx';

interface Task {
  id: string;
  title: string;
  brief: string;
  setups: { id: string; label: string; detail: string }[];
}

/** Starts a task for the agent team and opens it in the activity log as it runs. */
export function NewTask() {
  const { dispatch } = useStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [task, setTask] = useState('');
  const [setup, setSetup] = useState('monitored');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/tasks')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`The server answered ${r.status}.`))))
      .then((t: Task[]) => {
        setTasks(t);
        setTask(t[0]?.id ?? '');
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task, setup }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}.`);
      dialog.current?.close();
      dispatch({ type: 'open-live', id: body.id });
      dispatch({ type: 'view', view: 'activity' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const current = tasks?.find((t) => t.id === task);
  return (
    <>
      <button type="button" className="new-task-btn" onClick={() => dialog.current?.showModal()}>
        <Plus size={16} aria-hidden="true" />
        New task
      </button>
      <dialog ref={dialog} className="task-dialog" aria-label="New task">
        <header>
          <h2>New task</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => dialog.current?.close()}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <label className="field">
          <span>Task for the agent team</span>
          <select value={task} onChange={(e) => setTask(e.target.value)} disabled={!tasks}>
            {tasks?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          {current && <small>{current.brief}</small>}
        </label>

        <fieldset className="setups">
          <legend>Set-up</legend>
          {current?.setups.map((s) => (
            <label key={s.id} className={setup === s.id ? 'is-on' : ''}>
              <input type="radio" name="setup" value={s.id} checked={setup === s.id} onChange={() => setSetup(s.id)} />
              <strong>{s.label}</strong>
              <span>{s.detail}</span>
            </label>
          ))}
        </fieldset>

        <p className="task-note">Replays the recorded run step by step. Connect an agent runtime to run your own tasks.</p>
        {error && <p className="task-error">{error}</p>}

        <footer>
          <button type="button" className="chat-play" onClick={run} disabled={busy || !current}>
            <Play size={15} fill="currentColor" strokeWidth={0} aria-hidden="true" />
            {busy ? 'Starting…' : 'Run task'}
          </button>
        </footer>
      </dialog>
    </>
  );
}
