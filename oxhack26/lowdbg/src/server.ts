import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatAnalyze, formatBuildResult, formatDebug, formatStatic } from "./core/format.js";
import { runAnalyze, runBuild, runDebug, runStatic } from "./core/pipeline.js";
import type { Context } from "./core/types.js";
import { readRange } from "./core/workspace.js";
import { debuggers } from "./debuggers/index.js";
import { adapters } from "./languages/index.js";

const SERVER_VERSION = "0.1.0";

const language = z.string().optional().describe(`Language id (${adapters.map((a) => a.id).join(", ")}). Inferred from the source file extensions when omitted.`);
const sources = z.array(z.string()).default([]).describe("Source files to compile, relative to the workspace root.");
const flags = z.array(z.string()).default([]).describe('Extra compiler flags, e.g. ["-std=c11", "-Iinclude", "-lm", "-DDEBUG"].');
const profile = z.string().optional().describe("Build/instrumentation profile. Call toolchain_info to list them.");
const buildCommand = z.string().optional().describe("Use instead of `sources` for projects with a Makefile/CMake: a shell command run in the root, with CC/CFLAGS (or CXX/CXXFLAGS) and LDFLAGS set for the profile. Requires `program`.");
const program = z.string().optional().describe("Path of the executable. Required with `buildCommand`. With neither `sources` nor `buildCommand` (debug only) it debugs an already-built binary, and `language` must then be given.");
const args = z.array(z.string()).default([]).describe("Command-line arguments for the program.");
const stdin = z.string().optional().describe("Text fed to the program's standard input. Without it stdin is closed.");
const env = z.record(z.string(), z.string()).default({}).describe("Extra environment variables for the program.");

const programShape = { language, sources, flags, profile, buildCommand, program, args, stdin, env };

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

function failure(e: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] };
}

/** Wrap a handler so thrown errors (bad path, missing tool) come back as readable tool errors. */
function safe<T>(fn: (input: T) => Promise<string>) {
  return async (input: T) => {
    try {
      return text(await fn(input));
    } catch (e) {
      return failure(e);
    }
  };
}

export function workflowPrompt(): string {
  const langs = adapters.map((a) => `### ${a.displayName}\nProfiles:\n${a.profiles.map((p) => `- ${p.id}: ${p.description}`).join("\n")}\n\n${a.guidance}`);
  return [
    "You are debugging low-level code. Do not guess from the source alone; gather evidence with the lowdbg tools, then fix.",
    "",
    "Workflow:",
    "1. Reproduce. Call `analyze` on the failing program with the inputs that trigger the problem. A sanitizer report gives the exact line, the access, and for heap bugs the allocation and free sites.",
    "2. Read the primary location with `read_source` (more context than the snippet) and reason about *why* the state is wrong, not just where it is.",
    "3. If the cause is still unclear, call `debug`. With profile `asan-ubsan` it stops at the sanitizer error with the program alive: you get locals for each frame. Otherwise set a `breakpoint` (with a `condition` for loops) and use `commands` such as `p *ptr`, `x/16xb buf`, `watchpoint set variable n`.",
    "4. Use `static_analyze` for bugs that only show on some paths (null derefs, uninitialized values, leaks).",
    "5. Fix the root cause, not the symptom. Rebuild and re-run `analyze` with the same inputs. Do not claim a fix until the same check that exposed the bug is clean.",
    "6. A clean run proves only that the exercised paths are clean. Say so, and try other inputs, `optimized`, or `tsan` where relevant.",
    "",
    ...langs,
  ].join("\n");
}

export function createServer(ctx: Context): McpServer {
  const server = new McpServer({ name: "lowdbg", version: SERVER_VERSION });

  server.registerTool(
    "toolchain_info",
    {
      title: "Toolchain info",
      description: "List supported languages, their instrumentation profiles, and which compilers, sanitizers and debuggers are actually usable on this machine. Call this first if a build or debug call fails unexpectedly.",
      inputSchema: {},
    },
    safe(async () => {
      const lines = [`Workspace root: ${ctx.root}`, ""];
      for (const a of adapters) {
        lines.push(`## ${a.displayName} (${a.id}) — extensions: ${a.extensions.join(" ")}`);
        for (const p of a.profiles) lines.push(`- profile ${p.id}: ${p.description}`);
        for (const t of await a.toolchain(ctx)) lines.push(`- ${t.name}: ${t.available ? `available${t.version ? ` (${t.version})` : ""}` : `UNAVAILABLE${t.note ? ` — ${t.note}` : ""}`}${t.available && t.note ? ` — ${t.note}` : ""}`);
        lines.push("");
      }
      lines.push("## Debuggers");
      for (const d of debuggers) {
        const t = await d.available();
        lines.push(`- ${d.id}: ${t.available ? `available${t.version ? ` (${t.version})` : ""}` : `UNAVAILABLE — ${t.note ?? ""}`}`);
      }
      return lines.join("\n");
    }),
  );

  server.registerTool(
    "build",
    {
      title: "Build",
      description: "Compile with a profile and return structured compiler diagnostics (errors, warnings with -Wall -Wextra, linker errors) with source snippets. Does not run the program.",
      inputSchema: { language, sources, flags, profile, buildCommand, program },
    },
    safe(async (input) => {
      const r = await runBuild(ctx, { ...input, args: [], env: {} });
      return formatBuildResult(r.build);
    }),
  );

  server.registerTool(
    "analyze",
    {
      title: "Analyze (build + run with sanitizers)",
      description:
        "The main tool. Builds with instrumentation (default profile asan-ubsan), runs the program, and returns structured findings ranked by severity: memory errors (overflow, use-after-free, double free) with allocation/free stacks, undefined behavior, data races, crashes, assertion failures, hangs. Each finding has the primary source location and a snippet. Finds only what the executed path triggers: pass the inputs that reproduce the bug.",
      inputSchema: { ...programShape, timeoutSec: z.number().int().min(1).max(300).default(20).describe("Kill the program after this many seconds.") },
    },
    safe(async (input) => formatAnalyze(await runAnalyze(ctx, input))),
  );

  server.registerTool(
    "static_analyze",
    {
      title: "Static analysis",
      description: "Run the compiler's static analyzer (clang --analyze or gcc -fanalyzer) without executing anything. Reports the path that leads to the bug (e.g. \"'p' initialized to null\" -> \"dereference\"). Finds null derefs, uninitialized values, leaks and dead stores that dynamic analysis misses when the path is not exercised. Expect some false positives.",
      inputSchema: { language, sources, flags },
    },
    safe(async (input) => {
      const r = await runStatic(ctx, input);
      return formatStatic(r.adapter.displayName, r.findings);
    }),
  );

  server.registerTool(
    "debug",
    {
      title: "Debug (run under a debugger)",
      description:
        "Run the program under a debugger (LLDB) and report each stop with a backtrace and the local variables of each user-code frame. With no breakpoints it runs until a crash. With profile asan-ubsan it stops inside the sanitizer error (program still alive) so you see the exact variable values that caused it. Use `breakpoints` (with `condition`) and `maxStops` to sample a loop; use `commands` for debugger commands run at every stop, e.g. `p *node`, `x/32xb buf`, `watchpoint set variable count`, `expression arr[i]`. Commands execute with the program's privileges.",
      inputSchema: {
        ...programShape,
        breakpoints: z
          .array(z.object({ file: z.string(), line: z.number().int().min(1), condition: z.string().optional().describe("Only stop when this C expression is true, e.g. \"i == 99\".") }))
          .default([])
          .describe("Source breakpoints."),
        breakOnSanitizerError: z.boolean().default(true).describe("With a sanitizer profile, stop at the sanitizer's error handler."),
        commands: z.array(z.string()).default([]).describe("Raw debugger commands to run at every stop."),
        maxStops: z.number().int().min(1).max(10).default(1).describe("How many times to stop (continuing between stops)."),
        frameDepth: z.number().int().min(1).max(16).optional().describe("How many frames to print locals for."),
        timeoutSec: z.number().int().min(5).max(300).default(60),
      },
    },
    safe(async (input) => formatDebug(await runDebug(ctx, input))),
  );

  server.registerTool(
    "read_source",
    {
      title: "Read source",
      description: "Read a line range of a file inside the workspace, with line numbers.",
      inputSchema: {
        file: z.string(),
        startLine: z.number().int().min(1).default(1),
        endLine: z.number().int().min(1).default(80),
      },
    },
    safe(async ({ file, startLine, endLine }) => readRange(ctx, file, startLine, Math.min(endLine, startLine + 400))),
  );

  server.registerPrompt(
    "debug",
    {
      title: "Debug low-level code",
      description: "Evidence-driven debugging workflow for C/C++ using the lowdbg tools.",
      argsSchema: { problem: z.string().optional().describe("What is going wrong, and how to reproduce it.") },
    },
    ({ problem }) => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: `${workflowPrompt()}\n\n${problem ? `Problem to investigate: ${problem}` : "Ask what to investigate, or look at the current file."}` },
        },
      ],
    }),
  );

  return server;
}
