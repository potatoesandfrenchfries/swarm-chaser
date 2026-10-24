import type { AnalyzeResult, DebugOutcome } from "./pipeline.js";
import type { BuildResult, DebugFrame, Finding, Frame } from "./types.js";

const MAX_OUTPUT = 24_000;
const MAX_FRAMES = 10;

function loc(f: Frame): string {
  if (!f.file) return f.module ? `(${f.module})` : "";
  return `${f.file}${f.line !== undefined ? `:${f.line}` : ""}${f.column !== undefined ? `:${f.column}` : ""}`;
}

function frameLine(f: Frame, withIndex = true): string {
  const idx = withIndex && f.index !== undefined ? `#${f.index} ` : "";
  const where = loc(f);
  return `${idx}${f.function ?? ""}${where ? `${f.function ? " at " : ""}${where}` : ""}${f.inUserCode ? "" : f.file || f.module ? "  [library]" : ""}`;
}

/** Sanitizer runtimes, the dynamic loader and libc entry points: never the cause of a user bug. */
const NOISE_MODULE = /libclang_rt|libasan|libtsan|libubsan|liblsan|libsystem_|libdyld|^dyld|ld-linux|libc\.so|libpthread/;

function isNoise(f: Frame): boolean {
  return !f.inUserCode && !f.file && !!f.module && NOISE_MODULE.test(f.module);
}

function frames(list: Frame[], max = MAX_FRAMES): string[] {
  const useful = list.filter((f) => !isNoise(f));
  const shown = (useful.length > 0 ? useful : list).slice(0, max).map((f) => `    ${frameLine(f)}`);
  if (useful.length > max) shown.push(`    ... ${useful.length - max} more`);
  return shown;
}

export function formatFinding(f: Finding, n: number): string {
  const out: string[] = [];
  out.push(`### ${n}. ${f.title}  [${f.kind} · ${f.source}]`);
  if (f.primary) out.push(`Where: ${frameLine(f.primary, false)}`);
  else if (f.frames[0]) out.push(`Where: ${frameLine(f.frames[0], false)}`);
  if (f.detail) out.push(f.detail);
  if (f.snippet) out.push("```\n" + f.snippet + "\n```");
  if (f.trace.length > 0) {
    out.push("Path:");
    for (const t of f.trace) out.push(`  - ${t.file ? `${t.file}:${t.line}: ` : ""}${t.message}`);
  }
  const bareLocation = f.frames.length === 1 && !f.frames[0]!.function;
  if (f.frames.length > 0 && !bareLocation) {
    out.push("Stack:", ...frames(f.frames));
  }
  for (const s of f.sections) out.push(`${s.label}:`, ...frames(s.frames, 6));
  return out.join("\n");
}

function formatBuild(b: BuildResult): string[] {
  const out: string[] = [];
  const errors = b.diagnostics.filter((d) => d.severity === "error");
  const warnings = b.diagnostics.filter((d) => d.severity === "warning");
  out.push(`Build: ${b.ok ? "ok" : "FAILED"}  (${b.command})`);
  if (errors.length) out.push("", "## Build errors", ...errors.map((f, i) => formatFinding(f, i + 1)));
  if (warnings.length) out.push("", `## Compiler warnings (${warnings.length})`, ...warnings.map((f, i) => formatFinding(f, i + 1)));
  if (b.rawTail) out.push("", "Raw build output:", "```", b.rawTail, "```");
  return out;
}

function cap(text: string): string {
  return text.length <= MAX_OUTPUT ? text : `${text.slice(0, MAX_OUTPUT)}\n\n[output truncated at ${MAX_OUTPUT} chars]`;
}

export function formatBuildResult(b: BuildResult): string {
  return cap(formatBuild(b).join("\n"));
}

export function formatAnalyze(r: AnalyzeResult): string {
  const out: string[] = [`Language: ${r.adapter.displayName} · profile: ${r.profile}`];
  out.push(...formatBuild(r.build));
  if (!r.run) {
    out.push("", "Program was not run because the build failed. Fix the build errors first.");
    return cap(out.join("\n"));
  }
  const run = r.run;
  const how = run.timedOut ? "TIMED OUT" : run.signal ? `killed by ${run.signal}` : `exit code ${run.exitCode}`;
  out.push("", `Run: ${how} after ${run.durationMs}ms`);
  if (run.findings.length === 0) {
    out.push(
      "",
      "No runtime errors detected in this execution.",
      "This does NOT prove the code is correct: only code paths exercised by these args/stdin were checked. " +
        "Vary the input, try profile `optimized` for UB that needs optimization, or `tsan` for threaded code.",
    );
  } else {
    out.push("", `## Runtime findings (${run.findings.length})`, ...run.findings.map((f, i) => formatFinding(f, i + 1)));
  }
  const noParsed = run.findings.every((f) => f.kind === "timeout" || f.kind === "crash") && run.stderrTail.trim();
  if (noParsed) out.push("", "stderr:", "```", run.stderrTail.trim(), "```");
  if (run.stdoutTail.trim()) out.push("", "stdout (tail):", "```", run.stdoutTail.trim(), "```");
  return cap(out.join("\n"));
}

export function formatStatic(adapterName: string, findings: Finding[]): string {
  if (findings.length === 0) return `${adapterName}: static analysis reported nothing. (It cannot see every bug; run \`analyze\` too.)`;
  return cap([`${adapterName}: static analysis found ${findings.length} issue(s)`, "", ...findings.map((f, i) => formatFinding(f, i + 1))].join("\n"));
}

function formatDebugFrame(f: DebugFrame): string[] {
  const out = [`  ${frameLine(f)}`];
  if (f.inUserCode) {
    for (const v of f.variables) out.push(`      ${v.name} = ${v.value.replace(/\n\s*/g, " ")}   (${v.type})`);
  }
  return out;
}

export function formatDebug(r: DebugOutcome): string {
  const out: string[] = [`Language: ${r.adapter.displayName} · profile: ${r.profile} · debugger: ${r.debuggerName}`];
  if (r.build) out.push(...formatBuild(r.build));
  if (!r.result) {
    out.push("", "Debugger was not started because the build failed.");
    return cap(out.join("\n"));
  }
  const d = r.result;
  for (const w of d.warnings) out.push("", `WARNING: ${w}`);
  if (d.timedOut) out.push("", "The debug session timed out and was killed.");
  if (d.stops.length === 0) {
    out.push(
      "",
      d.exited
        ? `The program ran to completion (exit code ${d.exited.code}) without stopping. No crash and no breakpoint was hit.`
        : "The program never stopped. See the transcript below.",
    );
  }
  d.stops.forEach((stop, i) => {
    out.push("", `## Stop ${i + 1}: ${stop.reason}`);
    // Runtime frames (sanitizer internals, libc) are one line each; user frames show their locals.
    const firstUser = stop.frames.findIndex((f) => f.inUserCode);
    const relevant = firstUser < 0 ? stop.frames : stop.frames.slice(Math.max(0, firstUser));
    if (firstUser > 0) out.push(`  (frames #0-#${firstUser - 1} are runtime/library internals)`);
    for (const f of relevant.filter((fr) => !isNoise(fr) && (fr.inUserCode || fr.file || fr.function))) out.push(...formatDebugFrame(f));
    for (const c of stop.commandOutputs) out.push("", `> ${c.command}`, c.output || "(no output)");
  });
  if (d.stops.length === 0 || d.timedOut) out.push("", "Debugger transcript (tail):", "```", d.transcriptTail, "```");
  return cap(out.join("\n"));
}
