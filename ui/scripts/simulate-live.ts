// Rehearse the live view without real agents: stream a run from the made-up example into local/live/,
// one step at a time, labelled as simulated (provenance "synthetic").
//
//   npm run live:simulate                      the "with a Judge" run, a step every 1.8 s
//   npm run live:simulate -- --run planted --interval 1200 --loop
//
// A real agent run streams the same way by appending lines to local/live/<name>.jsonl (see server/live.ts).
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Bundle } from '../src/model/types.ts';
import { LIVE_DIR, ensureLiveDir } from '../server/live.ts';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const runId = opt('run', 'monitored');
const interval = Number(opt('interval', '1800'));
const name = opt('name', `simulated-${runId}`);
const loop = args.includes('--loop');

const bundle = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data', 'synthetic', 'merch-launch.json'), 'utf8')) as Bundle;
const run = bundle.runs.find((r) => r.id === runId);
if (!run) {
  console.error(`No run ${runId}. Choose one of: ${bundle.runs.map((r) => r.id).join(', ')}`);
  process.exit(1);
}
ensureLiveDir();
const file = join(LIVE_DIR, `${name}.jsonl`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

do {
  const { events, ...rest } = run;
  const header = {
    type: 'header',
    schema: 'claim-spread/live@1',
    title: `Simulated live: ${run.title}`,
    provenance: 'synthetic',
    description: `The made-up example "${run.title}", streamed one step at a time to rehearse the live view. Not real agents.`,
    source: 'ui/scripts/simulate-live.ts',
    run: rest,
  };
  writeFileSync(file, JSON.stringify(header) + '\n');
  console.log(`Streaming ${events.length} steps of "${run.title}" to ${file} (simulated, made-up example).`);
  for (const e of events) {
    await sleep(interval);
    appendFileSync(file, JSON.stringify({ type: 'event', event: e }) + '\n');
    console.log(`  step ${e.seq + 1}: ${e.summary}`);
  }
  if (loop) await sleep(interval * 3);
} while (loop);
console.log('Done. The file stays in local/live/ until you delete it.');
