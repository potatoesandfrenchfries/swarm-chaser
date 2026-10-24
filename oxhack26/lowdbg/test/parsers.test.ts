import { describe, expect, it } from "vitest";
import { parseAssertion } from "../src/parsers/crash.js";
import { parseDiagnostics, parseLinkerError } from "../src/parsers/diagnostics.js";
import { parseFrameLine } from "../src/parsers/frames.js";
import { parseSanitizerOutput } from "../src/parsers/sanitizers.js";
import { parseBacktrace, parseTranscript, parseVariables, splitTranscript } from "../src/debuggers/lldb.js";

describe("parseFrameLine", () => {
  it("parses Linux ASan frames with absolute paths", () => {
    expect(parseFrameLine("    #0 0x55d5c2a3e1a4 in main /home/u/proj/src/a.c:7:10")).toMatchObject({
      index: 0, function: "main", file: "/home/u/proj/src/a.c", line: 7, column: 10,
    });
  });
  it("keeps C++ function signatures with spaces", () => {
    expect(parseFrameLine("    #2 0x4a1 in Foo::bar(int, char const*) /src/foo.cpp:12:3")).toMatchObject({
      function: "Foo::bar(int, char const*)", file: "/src/foo.cpp", line: 12,
    });
  });
  it("parses macOS basename-only frames", () => {
    expect(parseFrameLine("    #0 0x000104ad47dc in main t.c:2")).toMatchObject({ function: "main", file: "t.c", line: 2 });
  });
  it("parses module-only frames without inventing a location", () => {
    const f = parseFrameLine("    #3 0x55d5c2a3e0c4 in _start (/home/u/a.out+0x10c4)")!;
    expect(f.function).toBe("_start");
    expect(f.file).toBeUndefined();
    expect(f.module).toBe("/home/u/a.out");
  });
  it("parses TSan frames", () => {
    expect(parseFrameLine("    #0 worker race.c:6:5 (race:arm64+0x100003f40)")).toMatchObject({ function: "worker", file: "race.c", line: 6, column: 5 });
    const f = parseFrameLine("    #0 pthread_create <null> (libclang_rt.tsan_osx_dynamic.dylib:arm64e+0x33834)")!;
    expect(f.function).toBe("pthread_create");
    expect(f.file).toBeUndefined();
  });
  it("rejects non-frame lines", () => {
    expect(parseFrameLine("READ of size 4 at 0x6020")).toBeUndefined();
  });
});

describe("parseSanitizerOutput", () => {
  it("parses a Linux heap-buffer-overflow with allocation stack", () => {
    const text = `=================================================================
==12345==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x602000000014 at pc 0x55d5 bp 0x7ffc sp 0x7ffc
WRITE of size 4 at 0x602000000014 thread T0
    #0 0x55d5c2a3e1a4 in main /home/u/proj/src/a.c:7:10
    #1 0x7f1c2a829d8f in __libc_start_call_main ../sysdeps/nptl/libc_start_call_main.h:58:16
    #2 0x55d5c2a3e0c4 in _start (/home/u/proj/a.out+0x10c4)

0x602000000014 is located 0 bytes after 4-byte region [0x602000000010,0x602000000014)
allocated by thread T0 here:
    #0 0x7f1c2aadc887 in malloc ../../../../src/libsanitizer/asan/asan_malloc_linux.cpp:145
    #1 0x55d5c2a3e16e in main /home/u/proj/src/a.c:5:13

SUMMARY: AddressSanitizer: heap-buffer-overflow /home/u/proj/src/a.c:7:10 in main
Shadow bytes around the buggy address:
  0x0c047fff7fb0: fa fa 00 00 00 00 00 00 00 00 00 00 00 00 00 00
==12345==ABORTING`;
    const [f] = parseSanitizerOutput(text);
    expect(f).toMatchObject({ kind: "memory-error", source: "asan", title: "AddressSanitizer: heap-buffer-overflow" });
    expect(f!.frames[0]).toMatchObject({ function: "main", line: 7 });
    expect(f!.frames).toHaveLength(3);
    expect(f!.detail).toContain("WRITE of size 4");
    expect(f!.detail).toContain("0 bytes after 4-byte region");
    expect(f!.sections).toHaveLength(1);
    expect(f!.sections[0]!.label).toBe("allocated by thread T0");
    expect(f!.sections[0]!.frames[1]).toMatchObject({ function: "main", line: 5 });
  });

  it("separates freed-by and allocated-by stacks for use-after-free", () => {
    const text = `==1==ERROR: AddressSanitizer: heap-use-after-free on address 0x1 at pc 0x2 bp 0x3 sp 0x4
READ of size 4 at 0x1 thread T0
    #0 0x1 in main a.c:11:5
0x1 is located 0 bytes inside of 16-byte region [0x1,0x2)
freed by thread T0 here:
    #0 0x1 in free (libasan.so+0x1)
    #1 0x1 in main a.c:10:5
previously allocated by thread T0 here:
    #0 0x1 in malloc (libasan.so+0x2)
    #1 0x1 in main a.c:7:5
SUMMARY: AddressSanitizer: heap-use-after-free a.c:11:5 in main`;
    const [f] = parseSanitizerOutput(text);
    expect(f!.sections.map((s) => s.label)).toEqual(["freed by thread T0", "previously allocated by thread T0"]);
    expect(f!.sections[0]!.frames[1]!.line).toBe(10);
  });

  it("names double-free and SEGV bug types", () => {
    expect(parseSanitizerOutput("==1==ERROR: AddressSanitizer: attempting double-free on 0x1 in thread T0:\n    #0 0x1 in free (x+0x1)\n    #1 0x1 in main a.c:8:5")[0]!.title).toBe("AddressSanitizer: attempting double-free");
    expect(parseSanitizerOutput("==1==ERROR: AddressSanitizer: SEGV on unknown address 0x000000000000 (pc 0x1 bp 0x2 sp 0x3 T0)\n==1==The signal is caused by a READ memory access.\n==1==Hint: address points to the zero page.\n    #0 0x1 in main a.c:13:20")[0]).toMatchObject({ title: "AddressSanitizer: SEGV" });
  });

  it("keeps stack-variable details and the owning frame", () => {
    const text = `==1==ERROR: AddressSanitizer: stack-buffer-overflow on address 0x7ffc at pc 0x1 bp 0x2 sp 0x3
WRITE of size 4 at 0x7ffc thread T0
    #0 0x1 in main a.c:6:16

Address 0x7ffc is located in stack of thread T0 at offset 48 in frame
    #0 0x1 in main a.c:3

  This frame has 1 object(s):
    [32, 48) 'buf' (line 4) <== Memory access at offset 48 overflows this variable
SUMMARY: AddressSanitizer: stack-buffer-overflow a.c:6:16 in main`;
    const [f] = parseSanitizerOutput(text);
    expect(f!.detail).toContain("'buf' (line 4)");
    expect(f!.sections[0]!.label).toBe("frame that owns the variable");
  });

  it("parses UBSan with and without stack traces", () => {
    const withStack = parseSanitizerOutput(`u.c:1:35: runtime error: signed integer overflow: 2147483647 + 1 cannot be represented in type 'int'
    #0 0x100388644 in main u.c:1
    #1 0x18eb244e0 in start+0x1b4c (dyld:arm64e+0x204e0)

SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior u.c:1:35`);
    expect(withStack).toHaveLength(1);
    expect(withStack[0]).toMatchObject({ kind: "undefined-behavior", title: "UndefinedBehaviorSanitizer: signed integer overflow" });
    expect(withStack[0]!.frames[0]).toMatchObject({ file: "u.c", line: 1 });

    const bare = parseSanitizerOutput("a.c:4:12: runtime error: division by zero");
    expect(bare[0]!.frames).toEqual([{ file: "a.c", line: 4, column: 12 }]);
  });

  it("dedupes repeated UB reports from a loop", () => {
    const line = "a.c:4:12: runtime error: shift exponent 40 is too large for 32-bit type 'int'\n";
    expect(parseSanitizerOutput(line.repeat(5))).toHaveLength(1);
  });

  it("parses LeakSanitizer into one finding per leak", () => {
    const text = `==1==ERROR: LeakSanitizer: detected memory leaks

Direct leak of 4 byte(s) in 1 object(s) allocated from:
    #0 0x1 in malloc (libasan.so+0x1)
    #1 0x1 in main a.c:5:13

Indirect leak of 8 byte(s) in 2 object(s) allocated from:
    #0 0x1 in malloc (libasan.so+0x1)
    #1 0x1 in make a.c:9:3

SUMMARY: AddressSanitizer: 12 byte(s) leaked in 3 allocation(s).`;
    const found = parseSanitizerOutput(text);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ kind: "memory-leak", severity: "warning" });
    expect(found[0]!.frames[1]).toMatchObject({ function: "main", line: 5 });
  });

  it("parses a TSan data race", () => {
    const text = `==================
WARNING: ThreadSanitizer: data race (pid=37125)
  Write of size 4 at 0x000104b7c000 by thread T1:
    #0 w r.c:3 (r:arm64+0x100000640)

  Previous write of size 4 at 0x000104b7c000 by main thread:
    #0 main r.c:4 (r:arm64+0x1000006bc)

  Location is global 'counter' at 0x000104b7c000 (r+0x100008000)

  Thread T1 (tid=16876391, running) created by main thread at:
    #0 pthread_create <null> (libtsan.dylib+0x33834)
    #1 main r.c:4 (r:arm64+0x1000006a0)

SUMMARY: ThreadSanitizer: data race r.c:3 in w
==================`;
    const [f] = parseSanitizerOutput(text);
    expect(f).toMatchObject({ kind: "data-race", source: "tsan", title: "ThreadSanitizer: data race" });
    expect(f!.frames[0]).toMatchObject({ function: "w", line: 3 });
    expect(f!.sections.map((s) => s.label)).toEqual(["previous write of 4 bytes by main thread", "thread T1 created by main thread"]);
    expect(f!.detail).toContain("global 'counter'");
  });

  it("classifies a lock-order inversion as a deadlock", () => {
    const text = "WARNING: ThreadSanitizer: lock-order-inversion (potential deadlock) (pid=1)\n  Cycle in lock order graph: M1 => M2 => M1\n\n  Mutex M2 acquired here while holding mutex M1 in main thread:\n    #0 pthread_mutex_lock <null> (x+0x1)\n    #1 f a.c:9:3 (a+0x1)\nSUMMARY: ThreadSanitizer: lock-order-inversion";
    expect(parseSanitizerOutput(text)[0]!.kind).toBe("deadlock");
  });

  it("returns nothing for clean output", () => {
    expect(parseSanitizerOutput("hello\nworld\n")).toEqual([]);
  });
});

describe("parseAssertion", () => {
  it("parses the BSD/macOS format", () => {
    expect(parseAssertion("Assertion failed: (b != 0), function checked_div, file assert-fail.c, line 4.")).toMatchObject({
      kind: "assertion", title: "Assertion failed: b != 0", frames: [{ function: "checked_div", file: "assert-fail.c", line: 4 }],
    });
  });
  it("parses the glibc format", () => {
    expect(parseAssertion("./a.out: src/a.c:5: foo: Assertion `x > 0' failed.\nAborted")).toMatchObject({
      title: "Assertion failed: x > 0", frames: [{ function: "foo", file: "src/a.c", line: 5 }],
    });
  });
  it("ignores ordinary output", () => {
    expect(parseAssertion("all fine")).toBeUndefined();
  });
});

describe("parseDiagnostics", () => {
  const opts = { source: "clang", errorKind: "compile-error", warningKind: "compile-warning" } as const;

  it("parses errors, warnings and attaches notes as trace", () => {
    const text = `In file included from main.c:1:
./util.h:3:5: warning: unused variable 'y' [-Wunused-variable]
main.c:12:5: error: use of undeclared identifier 'x'
main.c:3:7: note: did you mean 'xx'?
    12 |     x = 1;
2 errors generated.`;
    const found = parseDiagnostics(text, opts);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ kind: "compile-warning", severity: "warning", frames: [{ file: "./util.h", line: 3, column: 5 }] });
    expect(found[1]).toMatchObject({ kind: "compile-error", title: "use of undeclared identifier 'x'" });
    expect(found[1]!.trace).toEqual([{ message: "did you mean 'xx'?", file: "main.c", line: 3, column: 7 }]);
  });

  it("drops the analyzer's trailing echo of the warning", () => {
    const text = `a.c:5:10: warning: Dereference of null pointer [core.NullDereference]
a.c:3:3: note: 'a' initialized to a null pointer value
a.c:5:10: note: Dereference of null pointer`;
    const [f] = parseDiagnostics(text, { source: "clang-analyzer", errorKind: "compile-error", warningKind: "static-analysis" });
    expect(f!.trace.map((t) => t.line)).toEqual([3]);
  });

  it("recognises linker failures", () => {
    const f = parseLinkerError(`Undefined symbols for architecture arm64:\n  "_helper", referenced from:\n      _main in main.o\nld: symbol(s) not found for architecture arm64`);
    expect(f?.title).toBe("Linker error");
    expect(f?.detail).toContain('"_helper"');
    expect(parseLinkerError("everything fine")).toBeUndefined();
  });
});

describe("lldb transcript parsing", () => {
  it("splits on echoed prompts", () => {
    expect(splitTranscript("junk\n(lldb) run\nout\n(lldb) bt\nframes")).toEqual([
      { command: "run", output: "out" },
      { command: "bt", output: "frames" },
    ]);
  });

  it("parses backtraces and variables", () => {
    const frames = parseBacktrace(`* thread #1, stop reason = breakpoint 1.1
  * frame #0: 0x0000000100000514 prog main at /w/src/a.c:7:26
    frame #1: 0x000000018eb244e4 dyld start
    frame #4: 0x000000010000085c h get(p=0x6020, i=4) at /w/h.c:5:10`);
    expect(frames.map((f) => [f.index, f.function, f.file, f.line])).toEqual([
      [0, "main", "/w/src/a.c", 7],
      [1, "start", undefined, undefined],
      [4, "get(p=0x6020, i=4)", "/w/h.c", 5],
    ]);

    expect(parseVariables(`(int *) p = 0x00006020000000f0\n(int) i = 4\n(Point) pt = {\n  x = 1\n  y = 2\n}`)).toEqual([
      { type: "int *", name: "p", value: "0x00006020000000f0" },
      { type: "int", name: "i", value: "4" },
      { type: "Point", name: "pt", value: "{\n  x = 1\n  y = 2\n}" },
    ]);
  });

  it("builds stops with locals and user command output, and flags unresolved breakpoints", () => {
    const internal = new Set(["thread backtrace -c 8", "frame select 0", "frame variable", "command source -e false -s false \"/t/b\""]);
    const text = `(lldb) breakpoint set --file nope.c --line 3
Breakpoint 1: no locations (pending).
(lldb) process launch -w "/w"
Process 1 launched
Process 1 stopped
* thread #1, stop reason = breakpoint 1.1
(lldb) command source -e false -s false "/t/b"
(lldb) thread backtrace -c 8
* thread #1, stop reason = breakpoint 1.1
  * frame #0: 0x1 prog main at /w/a.c:7:26
(lldb) frame select 0
(lldb) frame variable
(int) idx = 3
(lldb) p idx * 2
(int) 6`;
    const r = parseTranscript(text, internal);
    expect(r.warnings[0]).toContain("did not resolve");
    expect(r.stops).toHaveLength(1);
    expect(r.stops[0]!.reason).toBe("breakpoint 1.1");
    expect(r.stops[0]!.frames[0]!.variables).toEqual([{ type: "int", name: "idx", value: "3" }]);
    expect(r.stops[0]!.commandOutputs).toEqual([{ command: "p idx * 2", output: "(int) 6" }]);
  });

  it("reports a normal exit when nothing stopped", () => {
    const r = parseTranscript(`(lldb) process launch\nProcess 9 exited with status = 0 (0x00000000) \n`, new Set());
    expect(r.stops).toEqual([]);
    expect(r.exited).toEqual({ code: 0 });
  });
});
