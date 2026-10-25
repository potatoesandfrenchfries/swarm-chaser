import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { RunDigest } from '../src/model/activity.ts';
import { outcomeWord } from '../src/model/metrics.ts';

/**
 * Mock sandbox runs from the stats branch's seeded generator (src/stats/mock.py, `mock_lab_runs`), read from the
 * lab_runs.json it writes. Each run records only its arm and whether the agent acted on the planted claim, so the
 * dashboard can count and list them but has no steps to replay. Regenerate with, on the stats branch:
 *
 *   PYTHONPATH=src uv run python -m stats.mock      # writes local/mock_stats/
 */
const UI_ROOT = resolve(import.meta.dirname, '..');
export const MOCK_STATS_DIR = resolve(process.env.MOCK_STATS_DIR ?? join(UI_ROOT, '..', 'local', 'mock_stats'));

interface LabRun {
  arm: string;
  run_dir: string;
  acted_on_claim: boolean | null;
}

export interface MockRun {
  id: string;
  digest: RunDigest;
}

/**
 * The stats arms in dashboard terms. The outside model that steps in on the third arm plays VETO's part, so a run
 * there where the agent did not act counts as blocked.
 */
const ARM: Record<string, { attack: boolean; veto: boolean }> = {
  no_plant: { attack: false, veto: false },
  planted_claim: { attack: true, veto: false },
  planted_claim_with_intervention: { attack: true, veto: true },
};

export function listMockRuns(): MockRun[] {
  const file = join(MOCK_STATS_DIR, 'lab_runs.json');
  if (!existsSync(file)) return [];
  const runs = JSON.parse(readFileSync(file, 'utf8')) as LabRun[];
  return runs
    .filter((r) => ARM[r.arm])
    .map((r) => {
      const { attack, veto } = ARM[r.arm];
      const acted = r.acted_on_claim === true;
      return { id: r.run_dir, digest: { outcome: outcomeWord(attack, acted, veto && !acted), attack, veto, alerts: [] } };
    });
}
