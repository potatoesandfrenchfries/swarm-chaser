import { useEffect, useRef, useState } from 'react';
import type { LiveSummary, LiveTask } from '../../server/live.ts';
import type { Bundle } from '../model/types.ts';
import { validateLiveBundle } from '../model/validate.ts';
import { useStore } from './store.tsx';

/** A run with no new step for this long, and no end line, has stopped without finishing. */
const STALE_MS = 60_000;

/** Where a listed run stands, in the word the dashboard shows while it has no outcome. */
export function runStatus(s: LiveSummary): 'ended' | 'Running' | 'Unfinished' {
  if (s.ended) return 'ended';
  return Date.now() - Date.parse(s.updatedAt) > STALE_MS ? 'Unfinished' : 'Running';
}

/** Live runs the server can see, refreshed every few seconds. */
export function useLiveSources(intervalMs = 4000) {
  const [sources, setSources] = useState<LiveSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch('/api/live');
        if (!res.ok) throw new Error();
        const list = (await res.json()) as LiveSummary[];
        if (!stop) {
          setSources(list);
          setError(null);
        }
      } catch {
        if (!stop) setError('The app server did not answer, so live runs cannot be listed.');
      }
    };
    load();
    const t = window.setInterval(load, intervalMs);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [intervalMs]);
  return { sources, error };
}

/** How long without a new step before the header says it is waiting. */
const QUIET_MS = 12_000;

/**
 * Holds the EventSource for the live run in the store. Every message is checked before it is applied;
 * a dropped connection keeps what arrived and says so. The browser reconnects by itself.
 */
export function useLiveConnection() {
  const { state, dispatch } = useStore();
  const id = state.live?.id ?? null;
  const quiet = useRef(0);
  useEffect(() => {
    if (!id) return;
    const es = new EventSource(`/api/live/${encodeURIComponent(id)}/stream`);
    const touch = () => {
      window.clearTimeout(quiet.current);
      quiet.current = window.setTimeout(() => dispatch({ type: 'live-status', status: 'quiet' }), QUIET_MS);
    };
    es.addEventListener('snapshot', (ev) => {
      const { bundle, problems, ended, task } = JSON.parse((ev as MessageEvent).data) as { bundle: Bundle | null; problems: string[]; ended: boolean; task: LiveTask | null };
      if (!bundle) return dispatch({ type: 'live-problem', message: 'The live file has no valid header yet.' });
      const bad = validateLiveBundle(bundle);
      if (bad.length) return dispatch({ type: 'bundle-failed', error: `The live run failed validation: ${bad[0]}` });
      dispatch({ type: 'live-snapshot', bundle, problems, ended, task });
      touch();
    });
    es.addEventListener('append', (ev) => {
      const { type, item } = JSON.parse((ev as MessageEvent).data);
      dispatch({ type: 'live-append', kind: type, item });
      touch();
    });
    es.addEventListener('problem', (ev) => dispatch({ type: 'live-problem', message: JSON.parse((ev as MessageEvent).data).message }));
    es.addEventListener('neo4j', (ev) => dispatch({ type: 'live-neo4j', state: JSON.parse((ev as MessageEvent).data).state }));
    es.addEventListener('end', () => dispatch({ type: 'live-status', status: 'ended' }));
    es.onopen = () => dispatch({ type: 'live-status', status: 'live' });
    es.onerror = () => dispatch({ type: 'live-status', status: 'lost' });
    return () => {
      es.close();
      window.clearTimeout(quiet.current);
    };
  }, [id, dispatch]);
}
