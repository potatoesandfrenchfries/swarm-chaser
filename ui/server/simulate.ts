import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Bundle } from '../src/model/types.ts';
import { LIVE_DIR, ensureLiveDir } from './live.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Stream one recorded run into local/live/<name>.jsonl a step at a time, labelled as simulated, so the
 * live views can be exercised without agents. A real agent runtime writes the same lines to the same place.
 */
export async function streamRecordedRun(bundle: Bundle, runId: string, name: string, interval: number, log: (line: string) => void = () => {}) {
  const run = bundle.runs.find((r) => r.id === runId);
  if (!run) throw new Error(`No run ${runId}. Choose one of: ${bundle.runs.map((r) => r.id).join(', ')}`);
  ensureLiveDir();
  const file = join(LIVE_DIR, `${name}.jsonl`);
  const { events, ...rest } = run;
  const header = {
    type: 'header',
    schema: 'claim-spread/live@1',
    title: run.title,
    provenance: 'synthetic',
    description: `The recorded run "${run.title}", replayed one step at a time. Not live agents.`,
    source: 'ui/server/simulate.ts',
    run: rest,
  };
  writeFileSync(file, JSON.stringify(header) + '\n');
  log(`Streaming ${events.length} steps of "${run.title}" to ${file} (simulated).`);
  for (const e of events) {
    await sleep(interval);
    appendFileSync(file, JSON.stringify({ type: 'event', event: e }) + '\n');
    log(`  step ${e.seq + 1}: ${e.summary}`);
  }
}
