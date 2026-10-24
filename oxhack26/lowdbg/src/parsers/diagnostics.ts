import type { Finding } from "../core/types.js";

/**
 * Parser for GCC/Clang-style text diagnostics:
 *
 *   file.c:12:5: warning: variable 'x' is uninitialized [-Wuninitialized]
 *   file.c:3:7: note: initialize the variable 'x' to silence this warning
 *
 * `note:` lines are attached to the preceding diagnostic as `trace` steps, which
 * is also how the clang static analyzer prints its explanation path.
 */
const DIAG = /^(.+?):(\d+):(?:(\d+):)?\s+(fatal error|error|warning|note):\s+(.*)$/;

export interface DiagnosticOptions {
  source: string;
  /** Kind to use for `error` diagnostics and for `warning` diagnostics. */
  errorKind: Finding["kind"];
  warningKind: Finding["kind"];
}

export function parseDiagnostics(text: string, opts: DiagnosticOptions): Finding[] {
  const findings: Finding[] = [];
  let current: Finding | undefined;

  for (const line of text.split(/\r?\n/)) {
    const m = DIAG.exec(line);
    if (!m) continue;
    const [, file, lineNo, col, level, message] = m as unknown as [string, string, string, string | undefined, string, string];
    const frame = { file, line: Number(lineNo), ...(col ? { column: Number(col) } : {}) };

    if (level === "note") {
      current?.trace.push({ message, ...frame });
      continue;
    }
    const isError = level === "error" || level === "fatal error";
    current = {
      kind: isError ? opts.errorKind : opts.warningKind,
      severity: isError ? "error" : "warning",
      source: opts.source,
      title: message,
      frames: [frame],
      sections: [],
      trace: [],
    };
    findings.push(current);
  }
  return dedupeDiagnostics(findings);
}

/** Analyzer paths end by repeating the warning as a note; drop that echo. */
function dedupeDiagnostics(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    const f0 = f.frames[0]!;
    const key = `${f.kind}|${f.title}|${f0.file}:${f0.line}:${f0.column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const last = f.trace[f.trace.length - 1];
    const bare = f.title.replace(/\s*\[[\w.-]+\]$/, "");
    if (last && last.message === bare && last.line === f0.line) f.trace.pop();
    out.push(f);
  }
  return out;
}

/** Collect the lines of a linker failure ("Undefined symbols ...", "undefined reference to ..."). */
export function parseLinkerError(text: string): Finding | undefined {
  const lines = text.split(/\r?\n/);
  const relevant = lines.filter(
    (l) =>
      /undefined reference to|multiple definition of|cannot find -l|Undefined symbols for architecture|duplicate symbol|symbol\(s\) not found|library not found|^\s+"_?\w+", referenced from|^\s+_\w+ in |^ld: /.test(l),
  );
  if (relevant.length === 0) return undefined;
  return {
    kind: "compile-error",
    severity: "error",
    source: "linker",
    title: "Linker error",
    detail: relevant.map((l) => l.trimEnd()).join("\n"),
    frames: [],
    sections: [],
    trace: [],
  };
}
