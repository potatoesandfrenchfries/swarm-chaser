// Rehearse the live view without real agents: stream a run from the made-up example into local/live/,
// one step at a time, labelled as simulated (provenance "synthetic").
//
//   npm run live:simulate                      the "with a Judge" run, a step every 1.8 s
//   npm run live:simulate -- --run planted --interval 1200 --loop
//
// A real agent run streams the same way by appending lines to local/live/<name>.jsonl (see server/live.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Bundle } from '../src/model/types.ts';
import { streamRecordedRun } from '../server/simulate.ts';

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
try {
  do {
    await streamRecordedRun(bundle, runId, name, interval, console.log);
    if (loop) await new Promise((r) => setTimeout(r, interval * 3));
  } while (loop);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
console.log('Done. The file stays in local/live/ until you delete it.');
