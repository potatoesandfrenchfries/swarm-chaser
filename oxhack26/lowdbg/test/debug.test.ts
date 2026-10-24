import { describe, expect, it } from "vitest";
import { runDebug, type DebugInput } from "../src/core/pipeline.js";
import { bugLines, hasClang, hasLldb, makeWorkspace } from "./helpers.js";

const ctx = makeWorkspace();
const input = (file: string, extra: Partial<DebugInput> = {}): DebugInput => ({
  sources: [file], flags: [], args: [], env: {},
  breakpoints: [], breakOnSanitizerError: true, commands: [], maxStops: 1, ...extra,
});

describe.skipIf(!hasClang || !hasLldb)("debugger (LLDB)", () => {
  it("stops at a crash and shows the null pointer", async () => {
    const r = await runDebug(ctx, input("c/null-deref.c"));
    const stop = r.result!.stops[0]!;
    expect(stop.reason).toMatch(/EXC_BAD_ACCESS|SIGSEGV/);
    const frame = stop.frames.find((f) => f.inUserCode)!;
    expect(frame).toMatchObject({ function: "main", file: "c/null-deref.c" });
    expect(frame.line).toBe(bugLines(ctx.root, "c/null-deref.c")[0]);
    expect(frame.variables.find((v) => v.name === "hit")!.value).toMatch(/^0x0+$/);
  });

  it("stops inside the sanitizer error with the live values that caused it", async () => {
    const r = await runDebug(ctx, input("c/stack-overflow.c", { profile: "asan-ubsan" }));
    const stop = r.result!.stops[0]!;
    const frame = stop.frames.find((f) => f.inUserCode)!;
    expect(frame.line).toBe(bugLines(ctx.root, "c/stack-overflow.c")[0]);
    expect(frame.variables.find((v) => v.name === "i")!.value).toBe("4");
    expect(frame.variables.find((v) => v.name === "buf")).toBeDefined();
  });

  it("honours breakpoints, stdin and user commands, and survives a failing command", async () => {
    const r = await runDebug(ctx, input("c/stdin-index.c", {
      stdin: "3\n",
      breakpoints: [{ file: "c/stdin-index.c", line: 7 }],
      commands: ["p bogus_symbol", "p table[idx]"],
    }));
    const stop = r.result!.stops[0]!;
    expect(stop.reason).toMatch(/breakpoint/);
    expect(stop.frames.find((f) => f.inUserCode)!.variables.find((v) => v.name === "idx")!.value).toBe("3");
    expect(stop.commandOutputs.find((c) => c.command === "p table[idx]")!.output).toContain("40");
  });

  it("samples a loop with a conditional breakpoint", async () => {
    const r = await runDebug(ctx, input("c/loop-sum.c", {
      breakpoints: [{ file: "c/loop-sum.c", line: 6, condition: "i == 3" }],
    }));
    const frame = r.result!.stops[0]!.frames.find((f) => f.inUserCode)!;
    expect(frame.variables.find((v) => v.name === "i")!.value).toBe("3");
    expect(frame.variables.find((v) => v.name === "sum")!.value).toBe("5"); // 0 + 1 + 4
  });

  it("collects several stops with continue between them", async () => {
    const r = await runDebug(ctx, input("c/loop-sum.c", {
      breakpoints: [{ file: "c/loop-sum.c", line: 6 }],
      maxStops: 3,
    }));
    const iValues = r.result!.stops.map((s) => s.frames.find((f) => f.inUserCode)!.variables.find((v) => v.name === "i")!.value);
    expect(iValues).toEqual(["0", "1", "2"]);
  });

  it("says so when the program finishes without stopping", async () => {
    const r = await runDebug(ctx, input("c/clean.c"));
    expect(r.result!.stops).toEqual([]);
    expect(r.result!.exited?.code).toBe(0);
  });

  it("warns about a breakpoint that matches no code", async () => {
    const r = await runDebug(ctx, input("c/clean.c", { breakpoints: [{ file: "c/clean.c", line: 9999 }] }));
    expect(r.result!.warnings.join("\n")).toMatch(/did not resolve/);
  });

  it("debugs a prebuilt binary", async () => {
    const built = await runDebug(ctx, input("c/null-deref.c"));
    const program = built.build!.program!.replace(`${ctx.root}/`, "");
    const r = await runDebug(ctx, input("", { sources: [], program, language: "c" }));
    expect(r.result!.stops[0]!.reason).toMatch(/EXC_BAD_ACCESS|SIGSEGV/);
  });

  it("does not run the debugger when the build fails", async () => {
    const r = await runDebug(ctx, input("c/compile-error.c"));
    expect(r.build!.ok).toBe(false);
    expect(r.result).toBeUndefined();
  });

  it("kills a hung session at the timeout", async () => {
    const r = await runDebug(ctx, input("c/hang.c", { timeoutSec: 5 }));
    // No crash and no breakpoint: the program spins until the debugger session is killed.
    expect(r.result!.timedOut).toBe(true);
  });
});
