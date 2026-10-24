import { existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, closeSync, watch, type FSWatcher } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ServerResponse } from 'node:http';
import { SCHEMA, type Actor, type Bundle, type Claim, type Provenance, type RecordNode, type ReplayEvent, type Run } from '../src/model/types.ts';
import { validateLiveBundle } from '../src/model/validate.ts';
import { configured, loadBundle, type Neo4jEnv } from './neo4j.ts';

/**
 * Live runs. An agent run streams by appending JSON lines to local/live/<name>.jsonl (git-ignored):
 *
 *   {"type":"header","schema":"claim-spread/live@1","title":…,"provenance":"live"|"synthetic","description":…,"source":…,
 *    "run":{"id":…,"title":…,"condition":…,"notes":[…],"actors":[…],"records":[…],"claims":[…]}}
 *   {"type":"actor","actor":{…}} / {"type":"record","record":{…}} / {"type":"claim","claim":{…}}   added at any point
 *   {"type":"event","event":{…one ReplayEvent}}       seq must be the next number
 *
 * Each item is nested under its own key, so an event's own "type" (read, claim, …) never collides with the line's.
 *
 * The server tails each file, validates every prefix with the same rules as a recorded bundle (a claim
 * may be declared before its origin step arrives), and pushes changes to browsers over Server-Sent
 * Events. When Neo4j is configured, each run is mirrored into the database as it grows.
 */

const UI_ROOT = resolve(import.meta.dirname, '..');
export const LIVE_DIR = resolve(process.env.LIVE_DIR ?? join(UI_ROOT, '..', 'local', 'live'));

interface Parsed {
  bundle: Bundle | null;
  /** Lines rejected so far, with the reason, so a bad line is visible rather than silently dropped. */
  problems: string[];
}

export interface LiveSummary {
  id: string;
  title: string;
  provenance: Provenance;
  events: number;
  updatedAt: string;
  problems: string[];
}

const safeId = (id: string) => /^[A-Za-z0-9._-]{1,80}$/.test(id);

export function listLive(): LiveSummary[] {
  if (!existsSync(LIVE_DIR)) return [];
  return readdirSync(LIVE_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .map((f) => {
      const id = f.slice(0, -'.jsonl'.length);
      const p = parseLive(readFileSync(join(LIVE_DIR, f), 'utf8'), id);
      return {
        id,
        title: p.bundle?.title ?? id,
        provenance: p.bundle?.provenance ?? 'live',
        events: p.bundle?.runs[0].events.length ?? 0,
        updatedAt: statSync(join(LIVE_DIR, f)).mtime.toISOString(),
        problems: p.problems,
      };
    });
}

/** Parse a live file into a one-run bundle, applying lines in order and refusing any that would break validity. */
export function parseLive(text: string, id: string): Parsed {
  const problems: string[] = [];
  let bundle: Bundle | null = null;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    let item: Record<string, unknown>;
    try {
      item = JSON.parse(line);
    } catch {
      if (i < lines.length - 1) problems.push(`Line ${i + 1} is not JSON.`);
      return; // the last line may still be being written
    }
    if (item.type === 'header') {
      const r = item.run as Run;
      const provenance = (item.provenance === 'synthetic' ? 'synthetic' : 'live') as Provenance;
      bundle = {
        schema: SCHEMA,
        id: `live-${id}`,
        title: String(item.title ?? id),
        provenance,
        description: String(item.description ?? ''),
        source: String(item.source ?? `local/live/${id}.jsonl`),
        experiment: null,
        runs: [{ ...r, provenance, actors: r.actors ?? [], records: r.records ?? [], claims: r.claims ?? [], notes: r.notes ?? [], events: [] }],
      };
      return;
    }
    if (!bundle) {
      problems.push(`Line ${i + 1} comes before the header.`);
      return;
    }
    const b: Bundle = bundle;
    const run = b.runs[0];
    const next: Run = { ...run };
    const type = item.type;
    const body = typeof type === 'string' ? item[type] : undefined;
    if (!body || typeof body !== 'object') {
      problems.push(`Line ${i + 1} should look like {"type":"event","event":{…}}; got type ${JSON.stringify(type)}.`);
      return;
    }
    if (type === 'event') next.events = [...run.events, body as ReplayEvent];
    else if (type === 'actor') next.actors = [...run.actors, body as Actor];
    else if (type === 'record') next.records = [...run.records, body as RecordNode];
    else if (type === 'claim') next.claims = [...run.claims, body as Claim];
    else {
      problems.push(`Line ${i + 1} has unknown type ${JSON.stringify(type)}.`);
      return;
    }
    const candidate: Bundle = { ...b, runs: [next] };
    const bad = validateLiveBundle(candidate);
    if (bad.length) problems.push(`Line ${i + 1} refused: ${bad[0]}`);
    else bundle = candidate;
  });
  return { bundle, problems };
}

/** One watcher per file, shared by every browser watching it. */
class Tail {
  private watcher: FSWatcher | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private clients = new Set<ServerResponse>();
  private size = -1;
  private last: Parsed = { bundle: null, problems: [] };
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  readonly id: string;
  private readonly env: Neo4jEnv;

  constructor(id: string, env: Neo4jEnv) {
    this.id = id;
    this.env = env;
  }

  private get file() {
    return join(LIVE_DIR, `${this.id}.jsonl`);
  }

  add(res: ServerResponse) {
    this.clients.add(res);
    this.refresh(true, res);
    if (!this.poll) {
      // fs.watch is fast but can miss events on some systems; a light poll backs it up.
      try {
        this.watcher = watch(this.file, () => this.refresh(false));
      } catch {
        this.watcher = null;
      }
      this.poll = setInterval(() => this.refresh(false), 700);
    }
    res.on('close', () => {
      this.clients.delete(res);
      if (!this.clients.size) this.stop();
    });
  }

  private stop() {
    this.watcher?.close();
    this.watcher = null;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    tails.delete(this.id);
  }

  private refresh(initial: boolean, only?: ServerResponse) {
    if (!existsSync(this.file)) {
      for (const c of this.clients) send(c, 'end', { reason: 'The live file was removed.' });
      return;
    }
    const size = statSync(this.file).size;
    if (!initial && size === this.size) return;
    const shrank = size < this.size;
    this.size = size;
    const parsed = parseLive(readTail(this.file), this.id);
    const before = this.last.bundle?.runs[0];
    const after = parsed.bundle?.runs[0];
    const targets = only ? [only] : [...this.clients];
    if (initial || shrank || !before || !after || after.id !== before.id || after.events.length < before.events.length) {
      for (const c of targets) send(c, 'snapshot', { bundle: parsed.bundle, problems: parsed.problems });
    } else {
      // Only what is new since the last push: added actors, records, claims, then events, in that order.
      const added = <T extends { id: string }>(xs: T[], ys: T[]) => ys.filter((y) => !xs.some((x) => x.id === y.id));
      for (const c of targets) {
        for (const a of added(before.actors, after.actors)) send(c, 'append', { type: 'actor', item: a });
        for (const r of added(before.records, after.records)) send(c, 'append', { type: 'record', item: r });
        for (const cl of added(before.claims, after.claims)) send(c, 'append', { type: 'claim', item: cl });
        for (const e of after.events.slice(before.events.length)) send(c, 'append', { type: 'event', item: e });
        for (const p of parsed.problems.slice(this.last.problems.length)) send(c, 'problem', { message: p });
      }
    }
    if (!only) this.last = parsed;
    else if (!this.last.bundle) this.last = parsed;
    this.scheduleSync();
  }

  /** Mirror the run into Neo4j shortly after it changes; failures are reported, never fatal. */
  private scheduleSync() {
    if (!configured(this.env) || !this.last.bundle) return;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(async () => {
      const bundle = this.last.bundle;
      if (!bundle) return;
      try {
        await loadBundle(this.env, bundle);
        for (const c of this.clients) send(c, 'neo4j', { state: 'synced', events: bundle.runs[0].events.length });
      } catch {
        for (const c of this.clients) send(c, 'neo4j', { state: 'failed' });
      }
    }, 600);
  }
}

function readTail(file: string): string {
  // Live files are small (hundreds of lines); reading whole keeps validation simple and exact.
  const fd = openSync(file, 'r');
  try {
    const size = statSync(file).size;
    const buf = Buffer.alloc(size);
    readSync(fd, buf, 0, size, 0);
    return buf.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

function send(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const tails = new Map<string, Tail>();

export function streamLive(id: string, res: ServerResponse, env: Neo4jEnv): boolean {
  if (!safeId(id) || !existsSync(join(LIVE_DIR, `${id}.jsonl`))) return false;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  res.write(': connected\n\n');
  const ping = setInterval(() => res.write(': ping\n\n'), 10_000);
  res.on('close', () => clearInterval(ping));
  let tail = tails.get(id);
  if (!tail) {
    tail = new Tail(id, env);
    tails.set(id, tail);
  }
  tail.add(res);
  return true;
}

export function ensureLiveDir() {
  mkdirSync(LIVE_DIR, { recursive: true });
}
