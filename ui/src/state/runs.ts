import { useEffect, useState } from 'react';
import type { MockRun } from '../../server/mock.ts';
import type { RunDigest } from '../model/activity.ts';
import { runStatus, useLiveSources } from './live.ts';
import type { Action } from './store.tsx';

/** One run as the overview lists it: a run on this server, or a mock run that records only its outcome. */
export interface RunRow {
  key: string;
  when: string;
  /** Null for a mock run, which has no steps. */
  steps: number | null;
  digest: RunDigest;
  /** The word shown instead of an outcome while the run has none: Running or Unfinished. */
  status: string | null;
  /** How to open the run; null when there is nothing to open. */
  open: Action | null;
  mock: boolean;
}

const timeOf = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function useMockRuns() {
  const [runs, setRuns] = useState<MockRun[]>([]);
  useEffect(() => {
    fetch('/api/mock-runs')
      .then((r) => (r.ok ? r.json() : []))
      .then(setRuns)
      .catch(() => setRuns([]));
  }, []);
  return runs;
}

/** Every run on this server, newest first, then the mock runs. */
export function useRuns(): { rows: RunRow[]; error: string | null } {
  const { sources, error } = useLiveSources();
  const mocks = useMockRuns();
  const live: RunRow[] = [...sources]
    .filter((s) => s.digest)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((s) => ({ key: s.id, when: timeOf(s.updatedAt), steps: s.events, digest: s.digest!, status: runStatus(s) === 'ended' ? null : runStatus(s), open: { type: 'open-live', id: s.id }, mock: false }));
  const mock: RunRow[] = mocks.map((m) => ({ key: m.id, when: 'Mock run', steps: null, digest: m.digest, status: null, open: null, mock: true }));
  return { rows: [...live, ...mock], error };
}
