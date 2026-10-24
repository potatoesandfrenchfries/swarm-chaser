import type { Finding, Frame, Section } from "../core/types.js";
import { parseFrameLine } from "./frames.js";

/**
 * Parser for LLVM/GCC sanitizer reports (AddressSanitizer, UndefinedBehaviorSanitizer,
 * LeakSanitizer, ThreadSanitizer). Operates on stderr text only, so it is reusable by
 * any language adapter whose compiler links the same runtimes (C, C++, Rust, Zig, ...).
 */
export function parseSanitizerOutput(text: string): Finding[] {
  const lines = text.split(/\r?\n/);
  const findings: Finding[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (UBSAN.test(line)) {
      i = parseUbsan(lines, i, findings);
    } else if (/ERROR: AddressSanitizer: /.test(line)) {
      i = parseAsan(lines, i, findings);
    } else if (/WARNING: ThreadSanitizer: /.test(line)) {
      i = parseTsan(lines, i, findings);
    } else if (LEAK_HEAD.test(line)) {
      i = parseLeak(lines, i, findings);
    } else {
      i++;
    }
  }
  return dedupe(findings);
}

const UBSAN = /^(.+?):(\d+):(\d+): runtime error: (.+)$/;
const LEAK_HEAD = /^(Direct|Indirect) leak of (\d+) byte\(s\) in (\d+) object\(s\) allocated from:/;

function collectFrames(lines: string[], start: number): { frames: Frame[]; next: number } {
  const frames: Frame[] = [];
  let i = start;
  for (; i < lines.length; i++) {
    const frame = parseFrameLine(lines[i]!);
    if (!frame) break;
    frames.push(frame);
  }
  return { frames, next: i };
}

function sameLocation(a: Frame, b: Frame): boolean {
  return a.file === b.file && a.line === b.line;
}

function parseUbsan(lines: string[], start: number, out: Finding[]): number {
  const m = UBSAN.exec(lines[start]!)!;
  const message = m[4]!;
  const loc: Frame = { file: m[1], line: Number(m[2]), column: Number(m[3]) };
  const { frames: stack, next } = collectFrames(lines, start + 1);
  const frames = stack.length > 0 && sameLocation(stack[0]!, loc) ? stack : [loc, ...stack];
  out.push({
    kind: "undefined-behavior",
    severity: "error",
    source: "ubsan",
    title: `UndefinedBehaviorSanitizer: ${message.split(": ")[0]}`,
    detail: message,
    frames,
    sections: [],
    trace: [],
  });
  return next;
}

/** "heap-buffer-overflow on address ..." -> "heap-buffer-overflow" */
function asanBugType(rest: string): string {
  const m = /^(.+?)(?:\s+on\s+|\s+\(|:\s|\s+in thread|$)/.exec(rest);
  return (m?.[1] ?? rest).trim();
}

function isAsanDetail(line: string): boolean {
  return (
    /^(READ|WRITE) of size \d+/.test(line) ||
    /^0x[0-9a-f]+ is located /.test(line) ||
    /^Address 0x[0-9a-f]+ is /.test(line) ||
    /^(The signal is caused by|Hint:)/.test(line) ||
    /^This frame has \d+ object/.test(line) ||
    /^\s+\[\d+, \d+\) '/.test(line)
  );
}

function sectionLabel(line: string): string | undefined {
  const m = /^(freed|previously allocated|allocated) by thread (T\d+)[^:]*here:/.exec(line);
  if (m) return `${m[1]} by thread ${m[2]}`;
  const created = /^Thread (T\d+) .*created by .* at:/.exec(line);
  if (created) return `thread ${created[1]} created at`;
  return undefined;
}

function parseAsan(lines: string[], start: number, out: Finding[]): number {
  const head = /ERROR: AddressSanitizer: (.+)$/.exec(lines[start]!)!;
  const bugType = asanBugType(head[1]!);
  const details: string[] = [];
  const sections: Section[] = [{ label: "error", frames: [] }];
  let i = start + 1;

  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^SUMMARY: /.test(line) || /^==\d+==ABORTING/.test(line)) {
      i++;
      break;
    }
    if (/ERROR: AddressSanitizer: /.test(line)) break;

    const label = sectionLabel(line);
    if (label) {
      sections.push({ label, frames: [] });
      continue;
    }
    if (/^Address 0x[0-9a-f]+ is located in stack of thread/.test(line)) {
      details.push(line.trim());
      sections.push({ label: "frame that owns the variable", frames: [] });
      continue;
    }
    const frame = parseFrameLine(line);
    if (frame) {
      sections[sections.length - 1]!.frames.push(frame);
      continue;
    }
    if (isAsanDetail(line)) details.push(line.trim());
  }

  const [main, ...rest] = sections;
  out.push({
    kind: "memory-error",
    severity: "error",
    source: "asan",
    title: `AddressSanitizer: ${bugType}`,
    detail: details.length ? details.join("\n") : undefined,
    frames: main!.frames,
    sections: rest.filter((s) => s.frames.length > 0),
    trace: [],
  });
  return i;
}

function parseLeak(lines: string[], start: number, out: Finding[]): number {
  const m = LEAK_HEAD.exec(lines[start]!)!;
  const { frames, next } = collectFrames(lines, start + 1);
  out.push({
    kind: "memory-leak",
    severity: "warning",
    source: "lsan",
    title: `LeakSanitizer: ${m[1]!.toLowerCase()} leak of ${m[2]} bytes in ${m[3]} object(s)`,
    frames,
    sections: [],
    trace: [],
  });
  return next;
}

function tsanSectionLabel(line: string): string | undefined {
  const access = /^\s+((?:Previous )?(?:[Aa]tomic )?(?:[Ww]rite|[Rr]ead)) of size (\d+) at 0x[0-9a-f]+ by (main thread|thread T\d+)/.exec(line);
  if (access) return `${access[1]!.toLowerCase()} of ${access[2]} bytes by ${access[3]}`;
  const created = /^\s+Thread (T\d+) .*created by (.+) at:/.exec(line);
  if (created) return `thread ${created[1]} created by ${created[2]}`;
  const mutex = /^\s+Mutex (M\d+) .*(?:created|acquired|destroyed) at:/.exec(line);
  if (mutex) return `mutex ${mutex[1]}`;
  return undefined;
}

function parseTsan(lines: string[], start: number, out: Finding[]): number {
  const head = /WARNING: ThreadSanitizer: (.+?)(?: \(pid=\d+\))?$/.exec(lines[start]!)!;
  const bugType = head[1]!;
  const details: string[] = [];
  const sections: Section[] = [];
  let i = start + 1;

  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^SUMMARY: ThreadSanitizer/.test(line)) {
      i++;
      break;
    }
    if (/WARNING: ThreadSanitizer: /.test(line)) break;

    const label = tsanSectionLabel(line);
    if (label) {
      sections.push({ label, frames: [] });
      continue;
    }
    const frame = parseFrameLine(line);
    if (frame) {
      sections[sections.length - 1]?.frames.push(frame);
      continue;
    }
    if (/^\s+(Location is|Heap block of size)/.test(line)) details.push(line.trim());
  }

  const populated = sections.filter((s) => s.frames.length > 0);
  const [main, ...rest] = populated;
  out.push({
    kind: /deadlock|lock-order/.test(bugType) ? "deadlock" : "data-race",
    severity: "error",
    source: "tsan",
    title: `ThreadSanitizer: ${bugType}`,
    detail: [main ? `first access: ${main.label}` : undefined, ...details].filter(Boolean).join("\n") || undefined,
    frames: main?.frames ?? [],
    sections: rest,
    trace: [],
  });
  return i;
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const f0 = f.frames[0];
    const key = `${f.source}|${f.title}|${f.detail ?? ""}|${f0?.file}:${f0?.line}:${f0?.column}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
