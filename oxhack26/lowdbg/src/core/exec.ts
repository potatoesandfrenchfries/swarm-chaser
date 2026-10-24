import { spawn } from "node:child_process";
import type { ExecResult } from "./types.js";

export interface ExecOptions {
  cwd: string;
  env?: Record<string, string>;
  timeoutMs: number;
  stdin?: string;
  /** Per-stream cap. Anything beyond is dropped and `truncated` is set. */
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

/** Environment passed to child processes: enough to find toolchains, nothing else from the host. */
export function baseEnv(extra: Record<string, string> = {}): Record<string, string> {
  const keep = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "SDKROOT", "DEVELOPER_DIR", "CC", "CXX"];
  const env: Record<string, string> = {};
  for (const key of keep) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return { ...env, ...extra };
}

/**
 * Spawn without a shell. The child gets its own process group so a timeout
 * kills the whole tree, including a debugger's inferior. stdin is closed (or
 * fed from `stdin`), because debuggers and interactive programs otherwise
 * block forever waiting on it.
 */
export function exec(file: string, args: string[], opts: ExecOptions): Promise<ExecResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const started = Date.now();

  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      env: opts.env ?? baseEnv(),
      stdio: [opts.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      detached: true,
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const append = (current: string, chunk: Buffer): string => {
      if (current.length >= maxBytes) {
        truncated = true;
        return current;
      }
      const next = current + chunk.toString("utf8");
      if (next.length > maxBytes) {
        truncated = true;
        return next.slice(0, maxBytes);
      }
      return next;
    };

    child.stdout?.on("data", (c: Buffer) => (stdout = append(stdout, c)));
    child.stderr?.on("data", (c: Buffer) => (stderr = append(stderr, c)));

    if (opts.stdin !== undefined && child.stdin) {
      child.stdin.on("error", () => {});
      child.stdin.end(opts.stdin);
    }

    const killGroup = () => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, opts.timeoutMs);

    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // A leftover grandchild would keep the pipes open; make sure nothing survives.
      killGroup();
      resolve({
        code,
        signal,
        stdout,
        stderr,
        timedOut,
        truncated,
        durationMs: Date.now() - started,
      });
    };

    child.on("error", (err) => {
      stderr += `\nfailed to start ${file}: ${err.message}`;
      finish(null, null);
    });
    child.on("close", finish);
  });
}

export async function which(name: string): Promise<string | undefined> {
  const r = await exec("/usr/bin/env", ["which", name], { cwd: process.cwd(), timeoutMs: 5000 });
  const out = r.stdout.trim().split("\n")[0];
  return r.code === 0 && out ? out : undefined;
}

export function tail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `[... ${text.length - maxChars} chars omitted ...]\n${text.slice(-maxChars)}`;
}
