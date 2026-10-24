import type { Frame } from "../core/types.js";

const NOTHING = new Set(["<null>", "<unknown>", "??", ""]);

/**
 * Parse one stack frame line in the LLVM sanitizer family's formats:
 *
 *   ASan/UBSan/LSan   #0 0x000104ad47dc in main t.c:2
 *                     #1 0x00018eb244e0 in start+0x1b4c (dyld:arm64e+0x204e0)
 *                     #2 0x7f12 in foo(int, char) /src/a.cpp:10:5
 *   TSan              #0 worker race.c:6:5 (race+0x100003f40)
 *                     #1 pthread_create <null> (libtsan.dylib+0x33834)
 *
 * Shared by every language whose toolchain emits LLVM sanitizer reports.
 */
export function parseFrameLine(line: string): Frame | undefined {
  const head = /^\s*#(\d+)\s+(.*)$/.exec(line);
  if (!head) return undefined;
  const frame: Frame = { index: Number(head[1]) };
  let body = head[2]!.trim();

  body = body.replace(/^0x[0-9a-f]+\s*/i, "");
  if (body.startsWith("in ")) body = body.slice(3);

  // Trailing "(module+0xoffset)" - the "+0x" requirement keeps "foo(int)" out.
  const mod = /\s*\(([^()]*\+0x[0-9a-f]+)\)\s*$/i.exec(body);
  if (mod) {
    frame.module = mod[1]!.slice(0, mod[1]!.lastIndexOf("+0x"));
    body = body.slice(0, mod.index);
  }

  const withFn = /^(.*\S)\s+(\S+?):(\d+)(?::(\d+))?$/.exec(body);
  const locOnly = /^(\S+?):(\d+)(?::(\d+))?$/.exec(body);
  if (withFn) {
    frame.function = withFn[1];
    frame.file = withFn[2];
    frame.line = Number(withFn[3]);
    if (withFn[4]) frame.column = Number(withFn[4]);
  } else if (locOnly) {
    frame.file = locOnly[1];
    frame.line = Number(locOnly[2]);
    if (locOnly[3]) frame.column = Number(locOnly[3]);
  } else {
    // "start+0x1b4c" or "pthread_create <null>"
    frame.function = body.replace(/\s+<null>$/, "").replace(/\+0x[0-9a-f]+$/i, "");
  }

  if (frame.file !== undefined && NOTHING.has(frame.file)) {
    delete frame.file;
    delete frame.line;
    delete frame.column;
  }
  if (frame.function !== undefined && NOTHING.has(frame.function)) delete frame.function;
  return frame;
}
