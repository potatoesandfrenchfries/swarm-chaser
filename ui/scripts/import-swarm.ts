// Turn a swarm log (one JSON object per line, many runs keyed by run_id) into one live file per run in
// local/live/, so each run shows on the dashboard. These are real model outputs, so provenance is "live".
//
//   npm run swarm:import -- "/path/to/swarm-log.jsonl" [--prefix qwen] [--alice "Qwen2.5 3B"] [--bob "Qwen2.5 3B"] [--judge "Claude Sonnet 5.5"]
//
// --prefix keeps logs that reuse run ids (swarm-plain-0, …) from overwriting each other. With --judge the
// influencer is Chaser, the monitor, on that model; without it, an unnamed Influencer agent.
//
// Mapping, since the swarm log and the replay model differ:
//   tool_call read_file / list_files -> read      tool_call anything else -> action
//   finished                          -> action (the tool the agent stopped with)
//   influencer                        -> claim (first time a text appears) on the shared board
//   board                             -> repeat of that claim, or a new claim if the text is new
//   reasoning                         -> the text of the same agent's next step
//   probe                             -> not an event; the log carries no probe scores, only that one ran
//   format_error                      -> not an event; noted on the run (the agent's reply could not be parsed)
import { existsSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Actor, Claim, RecordNode, ReplayEvent } from '../src/model/types.ts';
import { ensureLiveDir, LIVE_DIR, parseLive } from '../server/live.ts';

interface Row {
  run_id: string;
  type: string;
  agent?: string;
  text?: string;
  tool?: string | null;
  args?: Record<string, string | number | boolean>;
  round?: number;
  step?: number;
  focus?: string;
  timestamp: string;
}

const READ_TOOLS = new Set(['read_file', 'list_files']);

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const path = argv[0];
if (!path || !existsSync(path)) {
  console.error('Usage: npm run swarm:import -- <swarm-log.jsonl> [--prefix p] [--alice model] [--bob model] [--judge model]');
  process.exit(1);
}
const MODELS: Record<string, string> = { alice: opt('alice') ?? 'Gemma 0.5B', bob: opt('bob') ?? 'Gemma 2B' };
const judge = opt('judge');
const prefix = opt('prefix') ? `${opt('prefix')}-` : '';

const rows: Row[] = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const byRun = new Map<string, Row[]>();
for (const r of rows) byRun.set(r.run_id, [...(byRun.get(r.run_id) ?? []), r]);

const name = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
// The log's times carry no zone; the runs were made in the UK on 25 Oct 2026, after BST ended, so local time is UTC.
const utc = (ts: string) => `${ts}Z`;

ensureLiveDir();
let failed = false;
for (const [logId, runRows] of byRun) {
  const runId = `${prefix}${logId}`;
  const task = runRows.find((r) => r.type === 'task');
  const variant = logId.split('-')[1] ?? logId;
  const actors: Actor[] = [];
  const records: RecordNode[] = [];
  const claims: Claim[] = [];
  const events: ReplayEvent[] = [];
  const pending = new Map<string, string>(); // agent -> reasoning waiting for its next step
  const probes: string[] = [];
  const formatErrors: string[] = [];

  const actor = (id: string, a: Omit<Actor, 'id' | 'name'> & { name?: string }) => {
    if (!actors.some((x) => x.id === id)) actors.push({ id, name: a.name ?? name(id), kind: a.kind, model: a.model, role: a.role });
    return id;
  };
  const label = (id: string) => actors.find((x) => x.id === id)?.name ?? name(id);
  const agent = (id: string) => actor(id, { kind: 'agent', model: MODELS[id] ?? null, role: id === task?.focus ? 'Focus agent' : 'Agent' });
  const record = (id: string, label: string, kind: RecordNode['kind']) => {
    if (!records.some((x) => x.id === id)) records.push({ id, label, kind, planted: false, content: null, source: null });
    return id;
  };
  const claimFor = (text: string, origin: string) => {
    const known = claims.find((c) => c.text === text);
    if (known) return { id: known.id, fresh: false };
    const id = `C${claims.length + 1}`;
    claims.push({ id, text, origin, ground_truth: null });
    return { id, fresh: true };
  };
  const push = (e: Omit<ReplayEvent, 'id' | 'seq' | 'order_basis' | 'verdict' | 'evidence' | 'causes' | 'basis' | 'source' | 'effect'>, r: Row) => {
    const seq = events.length;
    events.push({ id: `e${seq}`, seq, order_basis: 'logged-sequence', verdict: null, evidence: [], causes: [], basis: 'observed', effect: null, source: { file: basename(path), ref: `${r.run_id} round ${r.round ?? 0}` }, ...e });
  };
  const thought = (a: string) => {
    const t = pending.get(a) || null;
    pending.delete(a);
    return t;
  };

  for (const r of runRows) {
    const ts = utc(r.timestamp);
    if (r.type === 'task') continue;
    if (r.type === 'probe') {
      probes.push(`${name(r.agent!)} step ${r.step}`);
      continue;
    }
    if (r.type === 'format_error') {
      formatErrors.push(`${name(r.agent!)} in round ${r.round}`);
      pending.delete(r.agent!);
      continue;
    }
    if (r.type === 'reasoning') {
      pending.set(r.agent!, r.text ?? '');
      continue;
    }
    if (r.type === 'tool_call') {
      const a = agent(r.agent!);
      const args = r.args ?? {};
      if (READ_TOOLS.has(r.tool!)) {
        const target = r.tool === 'read_file' ? record(`file:${args.path}`, String(args.path), 'document') : record('files', 'Project files', 'listing');
        push({ ts, type: 'read', actor: a, target: { kind: 'record', id: target }, claim: null, text: thought(a), summary: `${label(a)} ${r.tool === 'read_file' ? `reads ${args.path}` : 'lists the project files'}.`, tool: { name: r.tool!, args } }, r);
      } else {
        const where = String(args.url ?? args.path ?? args.command ?? r.tool);
        const target = record(`tool:${where}`, where, 'tool');
        push({ ts, type: 'action', actor: a, target: { kind: 'record', id: target }, claim: null, text: thought(a), summary: `${label(a)} calls ${r.tool} on ${where}.`, tool: { name: r.tool!, args } }, r);
      }
      continue;
    }
    if (r.type === 'finished') {
      const a = agent(r.agent!);
      push({ ts, type: 'action', actor: a, target: null, claim: null, text: thought(a), summary: r.tool ? `${label(a)} stops with ${r.tool}.` : `${label(a)} stops without calling a tool.`, tool: r.tool ? { name: r.tool, args: {} } : null }, r);
      continue;
    }
    if (r.type === 'influencer' || r.type === 'board') {
      const a = r.type === 'influencer'
        ? actor('influencer', judge ? { name: 'Chaser', kind: 'monitor', model: judge, role: 'Reviews the board and steers both agents between rounds' } : { kind: 'agent', model: null, role: 'Posts to both agents between rounds' })
        : agent(r.agent!);
      const board = record('board', 'Shared board', 'message');
      const c = claimFor(r.text ?? '', `e${events.length}`);
      if (r.type === 'board') thought(a);
      push({ ts, type: c.fresh ? 'claim' : 'repeat', actor: a, target: { kind: 'record', id: board }, claim: c.id, text: r.text ?? null, summary: c.fresh ? `${label(a)} posts to the board.` : `${label(a)} reposts the same message to the board.`, tool: null }, r);
      continue;
    }
    console.warn(`${runId}: skipped unknown row type ${r.type}`);
  }

  const notes = [
    `Task: ${task?.text ?? 'not in the log'}`,
    'Reasoning text is shown on the step the agent took next.',
    probes.length ? `The white-box probe ran at ${probes.join(', ')}; this log has no probe scores.` : 'No white-box probe steps in this log.',
    ...(formatErrors.length ? [`Replies that could not be parsed, so no step is shown: ${formatErrors.join(', ')}.`] : []),
    'Times are read as UTC; the log does not say which zone.',
  ];
  const header = {
    type: 'header',
    schema: 'claim-spread/live@1',
    title: `${task?.text ?? runId} (${variant})`,
    provenance: 'live',
    description: `Alice (${MODELS.alice}) and Bob (${MODELS.bob})${judge ? `, steered by Chaser (${judge})` : ''}, run ${logId}, prompt variant "${variant}".`,
    source: basename(path),
    run: { id: runId, title: `${runId}: ${task?.text ?? ''}`, condition: null, notes, actors, records, claims },
  };
  const lines = [header, ...events.map((event) => ({ type: 'event', event })), { type: 'end' }].map((l) => JSON.stringify(l)).join('\n') + '\n';

  const check = parseLive(lines, runId);
  if (check.problems.length || !check.ended) {
    console.error(`${runId}: refused\n  ${check.problems.join('\n  ')}`);
    failed = true;
    continue;
  }
  const file = join(LIVE_DIR, `${runId}.jsonl`);
  writeFileSync(file, lines);
  // The dashboard lists runs by file time; use the run's last log time so they sort as they ran.
  const last = new Date(utc(runRows[runRows.length - 1].timestamp));
  utimesSync(file, last, last);
  console.log(`${runId}: ${events.length} steps -> ${file}`);
}
process.exit(failed ? 1 : 0);
