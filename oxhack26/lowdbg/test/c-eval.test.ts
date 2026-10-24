import { describe, expect, it } from "vitest";
import { runAnalyze, runBuild, runStatic, type ProgramInput } from "../src/core/pipeline.js";
import { bugLines, findAt, hasClang, makeWorkspace, toolWorks } from "./helpers.js";

/**
 * Ground-truth evaluation: each fixture is a tiny program with a known bug, the
 * offending line marked `// BUG`. We assert the pipeline both classifies the bug and
 * points at that line. This is the accuracy check for everything below the LLM.
 */
const ctx = makeWorkspace();
const input = (file: string, extra: Partial<ProgramInput> = {}): ProgramInput => ({
  sources: [file], flags: [], args: [], env: {}, ...extra,
});

const canTsan = hasClang && (await toolWorks("sh", ["-c", "echo 'int main(void){return 0;}' | clang -x c -fsanitize=thread - -o /dev/null"]));

interface Case {
  file: string;
  profile?: string;
  stdin?: string;
  /** Any finding with one of these kinds, whose title matches, at a BUG line. */
  kinds: string[];
  title: RegExp;
}

const dynamicCases: Case[] = [
  { file: "c/heap-overflow.c", kinds: ["memory-error"], title: /heap-buffer-overflow/ },
  { file: "c/use-after-free.c", kinds: ["memory-error"], title: /heap-use-after-free/ },
  { file: "c/double-free.c", kinds: ["memory-error"], title: /double-free/ },
  { file: "c/stack-overflow.c", kinds: ["memory-error", "undefined-behavior"], title: /stack-buffer-overflow|out of bounds|Out of bounds/i },
  { file: "c/global-overflow.c", kinds: ["memory-error", "undefined-behavior"], title: /global-buffer-overflow|out of bounds/i },
  { file: "c/signed-overflow.c", kinds: ["undefined-behavior"], title: /signed integer overflow/ },
  { file: "c/div-zero.c", kinds: ["undefined-behavior"], title: /division by zero/ },
  { file: "c/null-deref.c", kinds: ["memory-error"], title: /SEGV/ },
  { file: "c/stdin-index.c", stdin: "9\n", kinds: ["memory-error", "undefined-behavior"], title: /stack-buffer-overflow|out of bounds/i },
];

describe.skipIf(!hasClang)("dynamic analysis finds the planted bug", () => {
  for (const c of dynamicCases) {
    it(`${c.file}`, async () => {
      const r = await runAnalyze(ctx, input(c.file, { profile: c.profile, stdin: c.stdin }));
      expect(r.build.ok).toBe(true);
      const findings = r.run!.findings;
      const hit = findAt(findings.filter((f) => c.kinds.includes(f.kind) && c.title.test(f.title)), bugLines(ctx.root, c.file));
      expect(hit, `findings: ${findings.map((f) => `${f.title}@${f.primary?.line}`).join(", ")}`).toBeDefined();
      expect(hit!.snippet).toContain("// BUG");
      expect(hit!.primary!.file).toBe(c.file);
    });
  }

  it("ranks memory errors ahead of the UB that precedes them", async () => {
    const r = await runAnalyze(ctx, input("c/stack-overflow.c"));
    const kinds = r.run!.findings.map((f) => f.kind);
    if (kinds.includes("memory-error") && kinds.includes("undefined-behavior")) {
      expect(kinds.indexOf("memory-error")).toBeLessThan(kinds.indexOf("undefined-behavior"));
    }
  });

  it("reports allocation and free sites for use-after-free", async () => {
    const r = await runAnalyze(ctx, input("c/use-after-free.c"));
    const f = r.run!.findings.find((x) => /use-after-free/.test(x.title))!;
    const labels = f.sections.map((s) => s.label.split(" by ")[0]);
    expect(labels).toContain("freed");
    expect(labels.some((l) => /allocated/.test(l!))).toBe(true);
    const freedLine = f.sections.find((s) => s.label.startsWith("freed"))!.frames.find((fr) => fr.inUserCode)!.line;
    expect(freedLine).toBe(10);
  });

  it("is quiet on correct code", async () => {
    const r = await runAnalyze(ctx, input("c/clean.c"));
    expect(r.run!.exitCode).toBe(0);
    expect(r.run!.findings).toEqual([]);
    expect(r.run!.stdoutTail).toContain("all good");
  });

  it("only reports the bug when the input triggers it", async () => {
    const ok = await runAnalyze(ctx, input("c/stdin-index.c", { stdin: "2\n" }));
    expect(ok.run!.findings).toEqual([]);
    expect(ok.run!.stdoutTail.trim()).toBe("30");
  });

  it("flags assertion failures with the asserted line", async () => {
    const r = await runAnalyze(ctx, input("c/assert-fail.c", { profile: "debug" }));
    const f = r.run!.findings.find((x) => x.kind === "assertion")!;
    expect(f.title).toContain("b != 0");
    expect(f.primary?.line).toBe(bugLines(ctx.root, "c/assert-fail.c")[0]);
  });

  it("detects a hang as a timeout and kills it", async () => {
    const r = await runAnalyze(ctx, input("c/hang.c", { profile: "debug", timeoutSec: 1 }));
    expect(r.run!.timedOut).toBe(true);
    expect(r.run!.findings[0]!.kind).toBe("timeout");
    expect(r.run!.durationMs).toBeLessThan(10_000);
  });

  it.skipIf(!canTsan)("finds a data race with tsan", async () => {
    const r = await runAnalyze(ctx, input("c/data-race.c", { profile: "tsan" }));
    const race = r.run!.findings.find((f) => f.kind === "data-race")!;
    expect(race).toBeDefined();
    expect(bugLines(ctx.root, "c/data-race.c")).toContain(race.primary!.line);
    expect(race.sections.some((s) => s.label.startsWith("previous"))).toBe(true);
  });

  it("surfaces compile errors with locations instead of running", async () => {
    const r = await runAnalyze(ctx, input("c/compile-error.c"));
    expect(r.build.ok).toBe(false);
    expect(r.run).toBeUndefined();
    const lines = r.build.diagnostics.filter((d) => d.severity === "error").map((d) => d.primary?.line);
    expect(lines.some((l) => l === 4 || l === 5)).toBe(true);
  });

  it("reports linker errors", async () => {
    const r = await runBuild(ctx, input("c/clean.c", { flags: ["-lnonexistentlib"] }));
    expect(r.build.ok).toBe(false);
    expect(r.build.diagnostics.some((d) => d.source === "linker" || d.severity === "error")).toBe(true);
  });

  it("rejects an unknown profile and paths outside the root", async () => {
    await expect(runAnalyze(ctx, input("c/clean.c", { profile: "nope" }))).rejects.toThrow(/Unknown profile/);
    await expect(runAnalyze(ctx, input("../../etc/passwd.c"))).rejects.toThrow(/outside the workspace/);
  });
});

describe.skipIf(!hasClang)("static analysis", () => {
  it("finds a null dereference with its path", async () => {
    const { findings } = await runStatic(ctx, { sources: ["c/static-null.c"], flags: [] });
    const f = findAt(findings, bugLines(ctx.root, "c/static-null.c"))!;
    expect(f.title).toMatch(/null pointer/);
    expect(f.trace.some((t) => /initialized to a null/.test(t.message))).toBe(true);
  });

  it("finds an uninitialized read", async () => {
    const { findings } = await runStatic(ctx, { sources: ["c/uninit.c"], flags: [] });
    expect(findAt(findings, bugLines(ctx.root, "c/uninit.c"))?.title).toMatch(/garbage value/);
  });

  it("reports nothing on clean code", async () => {
    expect((await runStatic(ctx, { sources: ["c/clean.c"], flags: [] })).findings).toEqual([]);
  });
});

describe.skipIf(!hasClang)("command-mode builds (Makefile projects)", () => {
  it("injects sanitizer flags through CC/CFLAGS and still finds the bug", async () => {
    const fs = await import("node:fs");
    fs.mkdirSync(`${ctx.root}/proj`, { recursive: true });
    fs.copyFileSync(`${ctx.root}/c/heap-overflow.c`, `${ctx.root}/proj/main.c`);
    fs.writeFileSync(`${ctx.root}/proj/Makefile`, "app: main.c\n\t$(CC) $(CFLAGS) main.c -o app $(LDFLAGS)\n");
    const r = await runAnalyze(ctx, {
      sources: [], flags: [], args: [], env: {}, language: "c",
      buildCommand: "make -C proj app", program: "proj/app",
    });
    expect(r.build.ok, r.build.rawTail).toBe(true);
    expect(r.run!.findings.some((f) => /heap-buffer-overflow/.test(f.title))).toBe(true);
  });
});
