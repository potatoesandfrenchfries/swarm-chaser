import fs from "node:fs";
import path from "node:path";
import type { Context, Finding, Frame } from "./types.js";

/** Open a workspace. Resolves symlinks once (macOS /tmp -> /private/tmp) so later comparisons are exact. */
export function openWorkspace(root: string): Context {
  return { root: fs.realpathSync(path.resolve(root)) };
}

function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Resolve a user- or tool-supplied path to a real path inside the workspace,
 * or return undefined. Never throws on a missing file.
 */
export function resolveInRoot(ctx: Context, p: string): string | undefined {
  const abs = path.resolve(ctx.root, p);
  let real = abs;
  try {
    real = fs.realpathSync(abs);
  } catch {
    // File may not exist yet; the lexical check below still applies.
  }
  return isInside(ctx.root, real) ? real : undefined;
}

/** Like resolveInRoot but throws a message suitable for returning to the model. */
export function requireInRoot(ctx: Context, p: string): string {
  const resolved = resolveInRoot(ctx, p);
  if (!resolved) throw new Error(`Path is outside the workspace root (${ctx.root}): ${p}`);
  return resolved;
}

export function relativeToRoot(ctx: Context, abs: string): string {
  return path.relative(ctx.root, abs) || ".";
}

export function ensureScratchDir(ctx: Context, ...parts: string[]): string {
  const base = path.join(ctx.root, ".lowdbg");
  fs.mkdirSync(base, { recursive: true });
  const ignore = path.join(base, ".gitignore");
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, "*\n");
  const dir = path.join(base, ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export interface SnippetOptions {
  /** Lines of context on each side. */
  context?: number;
}

/** Numbered lines around `line`, with `>` marking the target. */
export function readSnippet(ctx: Context, file: string, line: number, opts: SnippetOptions = {}): string | undefined {
  const real = resolveInRoot(ctx, file);
  if (!real) return undefined;
  let text: string;
  try {
    text = fs.readFileSync(real, "utf8");
  } catch {
    return undefined;
  }
  const lines = text.split("\n");
  const context = opts.context ?? 3;
  const from = Math.max(1, line - context);
  const to = Math.min(lines.length, line + context);
  if (from > lines.length) return undefined;
  const width = String(to).length;
  const out: string[] = [];
  for (let n = from; n <= to; n++) {
    out.push(`${n === line ? ">" : " "} ${String(n).padStart(width)} | ${lines[n - 1] ?? ""}`);
  }
  return out.join("\n");
}

export function readRange(ctx: Context, file: string, start: number, end: number): string {
  const real = requireInRoot(ctx, file);
  const lines = fs.readFileSync(real, "utf8").split("\n");
  const from = Math.max(1, start);
  const to = Math.min(lines.length, end);
  const width = String(to).length;
  const out: string[] = [];
  for (let n = from; n <= to; n++) out.push(`${String(n).padStart(width)} | ${lines[n - 1] ?? ""}`);
  return out.join("\n");
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".lowdbg", "target", "build", "dist", ".venv"]);
const MAX_INDEXED_FILES = 20_000;
const basenameIndexes = new WeakMap<Context, Map<string, string[]>>();

/** basename -> real paths of every file in the workspace (bounded, built once per context). */
function basenameIndex(ctx: Context): Map<string, string[]> {
  let index = basenameIndexes.get(ctx);
  if (index) return index;
  index = new Map();
  let count = 0;
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (count > MAX_INDEXED_FILES) return;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) walk(path.join(dir, e.name));
      } else if (e.isFile()) {
        count++;
        const list = index!.get(e.name) ?? [];
        list.push(path.join(dir, e.name));
        index!.set(e.name, list);
      }
    }
  };
  walk(ctx.root);
  basenameIndexes.set(ctx, index);
  return index;
}

/**
 * Map a path as printed by a tool back to a file in the workspace. Symbolizers disagree:
 * Linux prints the path given to the compiler, macOS (atos) prints only the basename. So try
 * the path itself, then the sources we compiled, then a unique basename match.
 */
export function locateFile(ctx: Context, file: string, hints: string[] = []): string | undefined {
  const direct = resolveInRoot(ctx, file);
  if (direct && fs.existsSync(direct)) return direct;
  if (path.isAbsolute(file)) return undefined;
  const norm = file.split(path.sep).join("/");
  for (const hint of hints) {
    const h = hint.split(path.sep).join("/");
    if (h === norm || h.endsWith(`/${norm}`)) {
      const real = resolveInRoot(ctx, hint);
      if (real && fs.existsSync(real)) return real;
    }
  }
  const candidates = basenameIndex(ctx).get(path.basename(file)) ?? [];
  const suffix = candidates.filter((c) => c.split(path.sep).join("/").endsWith(`/${norm}`));
  return suffix.length === 1 ? suffix[0] : undefined;
}

function markFrame(ctx: Context, frame: Frame, hints: string[]): void {
  if (!frame.file) return;
  const real = locateFile(ctx, frame.file, hints);
  if (real && !real.includes(`${path.sep}.lowdbg${path.sep}`)) {
    frame.inUserCode = true;
    frame.file = relativeToRoot(ctx, real);
  }
}

export function enrichFrames(ctx: Context, frames: Frame[], hints: string[] = []): void {
  for (const frame of frames) markFrame(ctx, frame, hints);
}

/**
 * Mark frames that live in the user's workspace, pick the `primary` frame and
 * attach a source snippet. Idempotent. This is language-agnostic: adapters only
 * need to report file:line. `hints` are the source files that were compiled.
 */
export function enrichFindings(ctx: Context, findings: Finding[], hints: string[] = []): Finding[] {
  for (const f of findings) {
    enrichFrames(ctx, f.frames, hints);
    for (const section of f.sections) enrichFrames(ctx, section.frames, hints);
    f.primary = f.frames.find((fr) => fr.inUserCode && fr.line !== undefined);
    if (f.primary?.file && f.primary.line !== undefined) {
      f.snippet = readSnippet(ctx, f.primary.file, f.primary.line);
    }
    for (const step of f.trace) {
      if (!step.file) continue;
      const real = locateFile(ctx, step.file, hints);
      if (real) step.file = relativeToRoot(ctx, real);
    }
  }
  return findings;
}
