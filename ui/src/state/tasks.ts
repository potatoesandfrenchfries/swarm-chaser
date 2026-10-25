import { useEffect, useState } from 'react';
import type { TaskInfo } from '../../server/api.ts';
import { useStore } from './store.tsx';

export type Setup = TaskInfo['setups'][number];

/** Tasks the server can start, with their set-ups and the attack text. */
export function useTasks() {
  const [list, setList] = useState<TaskInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/tasks')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`The server answered ${r.status}.`))))
      .then(setList)
      .catch((e) => setError((e as Error).message));
  }, []);
  return { list, error };
}

/** Starts a task with one set-up and opens its run as it streams in. */
export function useStartRun() {
  const { dispatch } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (task: string, setup: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task, setup }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}.`);
      dispatch({ type: 'open-live', id: body.id });
      dispatch({ type: 'view', view: 'chat' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error };
}

export type StartRun = ReturnType<typeof useStartRun>;

export const setupOf = (task: TaskInfo, attack: boolean, veto: boolean): Setup | undefined => task.setups.find((s) => s.attack === attack && s.veto === veto);
