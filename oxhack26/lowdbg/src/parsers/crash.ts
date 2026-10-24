import type { Finding } from "../core/types.js";

/**
 * Assertion failures, in the two libc formats:
 *   macOS/BSD  Assertion failed: (x > 0), function foo, file a.c, line 5.
 *   glibc      prog: a.c:5: foo: Assertion `x > 0' failed.
 */
export function parseAssertion(text: string): Finding | undefined {
  const bsd = /Assertion failed: \((.*)\), function (\S+), file (.+), line (\d+)\./.exec(text);
  if (bsd) return assertion(bsd[1]!, bsd[2]!, bsd[3]!, Number(bsd[4]));
  const glibc = /^(?:.*?: )?(.+?):(\d+): (\S+): Assertion [`'](.*)' failed\./m.exec(text);
  if (glibc) return assertion(glibc[4]!, glibc[3]!, glibc[1]!, Number(glibc[2]));
  return undefined;
}

function assertion(expr: string, fn: string, file: string, line: number): Finding {
  return {
    kind: "assertion",
    severity: "error",
    source: "libc",
    title: `Assertion failed: ${expr}`,
    frames: [{ function: fn, file, line }],
    sections: [],
    trace: [],
  };
}

const SIGNAL_HINTS: Record<string, string> = {
  SIGSEGV: "invalid memory access (null/dangling pointer, stack overflow, bad index)",
  SIGBUS: "misaligned or invalid memory access",
  SIGABRT: "abort() was called (failed assertion, double free detected by libc, or explicit abort)",
  SIGFPE: "arithmetic fault (integer division by zero or INT_MIN / -1)",
  SIGILL: "illegal instruction (often a trap from corrupted code pointer or __builtin_trap)",
  SIGTRAP: "trap instruction (e.g. a compiler-inserted check or an unreachable path)",
};

export function crashFromSignal(signal: string): Finding {
  return {
    kind: "crash",
    severity: "error",
    source: "runtime",
    title: `Terminated by ${signal}`,
    detail: SIGNAL_HINTS[signal],
    frames: [],
    sections: [],
    trace: [],
  };
}
