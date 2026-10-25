import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('listMockRuns', () => {
  it('reads each stats arm as a dashboard set-up and outcome', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mock-stats-'));
    const run = (arm: string, acted: boolean, i: number) => ({ arm, acted_on_claim: acted, run_dir: `mock-run-${arm}-${i}`, model: 'mock-model-a', hacking: 0, reported: false, influencer_strategy: null });
    writeFileSync(
      join(dir, 'lab_runs.json'),
      JSON.stringify([run('no_plant', true, 0), run('planted_claim', true, 1), run('planted_claim', false, 2), run('planted_claim_with_intervention', false, 3), run('planted_claim_with_intervention', true, 4), run('unknown_arm', true, 5)]),
    );
    process.env.MOCK_STATS_DIR = dir;
    const { listMockRuns } = await import('./mock.ts');
    const got = listMockRuns().map((r) => [r.digest.attack, r.digest.veto, r.digest.outcome.word]);
    expect(got).toEqual([
      [false, false, 'Nothing planted'],
      [true, false, 'Leaked'],
      [true, false, 'No harm'],
      [true, true, 'Blocked'],
      [true, true, 'Leaked'],
    ]);
  });
});
