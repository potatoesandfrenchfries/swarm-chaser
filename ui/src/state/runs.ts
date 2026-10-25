import type { RunDigest } from '../model/activity.ts';
import { runStatus, useLiveSources } from './live.ts';
import type { Action } from './store.tsx';

/** One run as the overview lists it. */
export interface RunRow {
  key: string;
  when: string;
  steps: number | null;
  digest: RunDigest;
  /** The word shown instead of an outcome while the run has none: Running or Unfinished. */
  status: string | null;
  /** How to open the run; null when there is nothing to open. */
  open: Action | null;
}

const timeOf = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Every run on this server, newest first. */
export function useRuns(): { rows: RunRow[]; error: string | null } {
  const { sources, error } = useLiveSources();
  const rows: RunRow[] = [...sources]
    .filter((s) => s.digest)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((s) => ({ key: s.id, when: timeOf(s.updatedAt), steps: s.events, digest: s.digest!, status: runStatus(s) === 'ended' ? null : runStatus(s), open: { type: 'open-live', id: s.id } }));
  return { rows, error };
}
