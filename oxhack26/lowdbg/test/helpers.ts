import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec, which } from "../src/core/exec.js";
import type { Finding } from "../src/core/types.js";
import { openWorkspace } from "../src/core/workspace.js";

const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");

/** Copy fixtures into a fresh temp root so test files can build in parallel without sharing outputs. */
export function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lowdbg-test-"));
  fs.cpSync(FIXTURES, dir, { recursive: true });
  return openWorkspace(dir);
}

export const hasClang = Boolean(await which("clang"));
export const hasLldb = Boolean(await which("lldb"));

export async function toolWorks(cmd: string, args: string[]): Promise<boolean> {
  const r = await exec(cmd, args, { cwd: process.cwd(), timeoutMs: 20_000 });
  return r.code === 0;
}

/** 1-indexed lines of a fixture carrying a `// BUG` marker. */
export function bugLines(root: string, file: string): number[] {
  return fs
    .readFileSync(path.join(root, file), "utf8")
    .split("\n")
    .flatMap((l, i) => (l.includes("// BUG") ? [i + 1] : []));
}

export function findAt(findings: Finding[], lines: number[]): Finding | undefined {
  return findings.find((f) => f.primary?.line !== undefined && lines.includes(f.primary.line));
}
