import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Bundle, Provenance } from '../src/model/types.ts';
import { validateBundle } from '../src/model/validate.ts';

// Vercel bundles the server into one function, so a path beside this file no longer reaches data/. The copied files sit at the deployment root, which is the working directory.
export const UI_ROOT = process.env.VERCEL ? process.cwd() : resolve(import.meta.dirname, '..');
/** Committed, hand-written bundles. Always provenance "synthetic". */
export const SYNTHETIC_DIR = join(UI_ROOT, 'data', 'synthetic');
/**
 * Bundles exported from real runs (village slice or sandbox). They hold record text under the
 * dataset's research-use terms, so they live in the repo's git-ignored local/ folder.
 */
export const RECORDED_DIR = resolve(process.env.REPLAY_DIR ?? join(UI_ROOT, '..', 'local', 'replay'));

export interface BundleSummary {
  id: string;
  title: string;
  provenance: Provenance;
  description: string;
  source: string;
  file: string;
  runs: { id: string; title: string; condition: string | null; events: number }[];
  /** Validation problems; a bundle with any is listed but never served. */
  problems: string[];
}

interface Loaded {
  summary: BundleSummary;
  bundle: Bundle | null;
}

function readDir(dir: string, expected: Provenance | null): Loaded[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const file = join(dir, f);
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(file, 'utf8'));
      } catch (e) {
        return { bundle: null, summary: broken(f, `Not valid JSON: ${(e as Error).message}`) };
      }
      const problems = validateBundle(raw);
      const b = raw as Bundle;
      if (expected && b.provenance !== expected) problems.push(`Files in this folder must be ${expected}; this one says ${b.provenance}.`);
      const summary: BundleSummary = {
        id: String(b.id ?? f),
        title: String(b.title ?? f),
        provenance: b.provenance,
        description: String(b.description ?? ''),
        source: String(b.source ?? ''),
        file: f,
        runs: Array.isArray(b.runs) ? b.runs.map((r) => ({ id: r.id, title: r.title, condition: r.condition, events: r.events?.length ?? 0 })) : [],
        problems,
      };
      return { summary, bundle: problems.length ? null : b };
    });
}

function broken(file: string, problem: string): BundleSummary {
  return { id: file, title: file, provenance: 'recorded', description: '', source: '', file, runs: [], problems: [problem] };
}

/** Read from disk on every call: bundles are small and this keeps a re-export visible without a restart. */
export function loadAll(): Loaded[] {
  const all = [...readDir(SYNTHETIC_DIR, 'synthetic'), ...readDir(RECORDED_DIR, null)];
  const seen = new Set<string>();
  for (const l of all) {
    if (seen.has(l.summary.id)) {
      l.summary.problems.push(`Another bundle already uses id ${l.summary.id}.`);
      l.bundle = null;
    }
    seen.add(l.summary.id);
  }
  return all;
}

export function getBundle(id: string): Bundle | null {
  return loadAll().find((l) => l.summary.id === id)?.bundle ?? null;
}
