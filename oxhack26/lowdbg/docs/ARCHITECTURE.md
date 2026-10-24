# lowdbg: architecture, design and scope

This document explains what lowdbg is for, how it works internally, why it is built the way it is, and
where its edges are. It is written for someone who will maintain or extend the code. For setup see the
[README](../README.md); for adding a language see [EXTENDING.md](EXTENDING.md).

Contents

1. [Problem and approach](#1-problem-and-approach)
2. [Scope](#2-scope)
3. [System overview](#3-system-overview)
4. [Data model](#4-data-model)
5. [How a request flows](#5-how-a-request-flows)
6. [Component reference](#6-component-reference)
7. [Design decisions](#7-design-decisions)
8. [Platform behaviour we had to learn](#8-platform-behaviour-we-had-to-learn)
9. [Safety and security model](#9-safety-and-security-model)
10. [Testing strategy](#10-testing-strategy)
11. [Limitations and roadmap](#11-limitations-and-roadmap)

---

## 1. Problem and approach

Debugging C, C++, Rust or Verilog with an LLM fails in a predictable way: the model reads source, forms a
plausible hypothesis, and proposes a plausible fix. In low-level code the real cause is often not in the
text it can see. A heap overflow is reported far from the bad write, undefined behavior depends on the
optimizer, a race depends on scheduling, and the value that matters exists only at run time.

lowdbg's approach is to put **ground truth between the model and the code**:

- the *compiler and sanitizers* say what is actually wrong and where,
- the *debugger* says what the variables actually contained at that moment,
- the *static analyzer* says which path leads to the bug even when it was not executed,
- and the same check that exposed the bug is re-run after the fix, so "fixed" is a measured fact.

The server contains **no LLM**. It is a set of deterministic tools. The model (in Zed, Claude Code, or any
MCP client) decides which tool to call; lowdbg makes each call reliable, bounded, and legible. This keeps
the part that can be tested rigorously (everything below the model) separate from the part that cannot.

The intended loop, also shipped as the `debug` MCP prompt:

```
reproduce ─▶ read evidence ─▶ inspect live state ─▶ fix root cause ─▶ re-run same check ─▶ report honestly
 (analyze)    (finding+snippet)   (debug)                              (analyze)        (clean ≠ correct)
```

## 2. Scope

### In scope

| Area | Status |
| --- | --- |
| Languages | **C** and **C++** (via a shared clang-family adapter) |
| Dynamic analysis | AddressSanitizer, UndefinedBehaviorSanitizer, ThreadSanitizer; LeakSanitizer where the platform has it |
| Static analysis | `clang --analyze`; `gcc -fanalyzer` as a fallback |
| Debugger | LLDB, batch mode: crash inspection, breakpoints (conditional, multi-stop), stdin, raw commands |
| Build | Direct compile of listed sources, or a user build command (Make-style) with sanitizer flags injected |
| Failure classes | memory errors, undefined behavior, data races, deadlocks (lock-order), leaks, crashes by signal, assertion failures, hangs, compile and link errors |
| Delivery | MCP server over stdio: six tools and one prompt |

### Explicitly out of scope (for now)

- **Generating fixes.** The server reports evidence; the model writes the patch. Nothing here edits user code.
- **Judging correctness.** A clean run proves only that the exercised paths are clean. The output says so.
- **Rust, Zig, Verilog/VHDL.** The design anticipates them ([EXTENDING.md](EXTENDING.md)); none is implemented.
- **gdb, rr, valgrind, MSan, core-dump analysis, attach-to-running-process.**
- **CMake / `compile_commands.json` awareness.** Make-style projects work through `buildCommand`.
- **Sandboxing.** See [section 9](#9-safety-and-security-model).
- **Windows.** Process-group handling and several assumptions are POSIX.

### Verification status

Developed and tested on macOS 26, arm64, Apple clang 21: ASan, UBSan, TSan, `clang --analyze`, LLDB.
Linux, gcc and gdb are **not** tested; the parsers are exercised on canned Linux-format reports only.
Zed integration follows its documented `context_servers` format but was not run against Zed.

## 3. System overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│ MCP client: Zed agent panel / Claude Code / Cursor / any MCP host          │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   │ stdio, JSON-RPC (MCP)
┌──────────────────────────────────▼─────────────────────────────────────────┐
│ index.ts    resolves --root, opens the workspace, connects the transport   │
│ server.ts   registers tools + prompt, validates input (zod), maps errors   │
├────────────────────────────────────────────────────────────────────────────┤
│ core/pipeline.ts      orchestration: build → run/debug → enrich → rank     │
│ core/format.ts        structured results → compact markdown for the model  │
│ core/workspace.ts     root confinement, path resolution, snippets, enrich  │
│ core/exec.ts          bounded child-process runner                         │
│ core/types.ts         Finding / Frame / LanguageAdapter / DebuggerBackend  │
├───────────────────────────────────┬────────────────────────────────────────┤
│ languages/  (LanguageAdapter)     │ debuggers/  (DebuggerBackend)          │
│   clang-family.ts  shared logic   │   lldb.ts   script gen + transcript    │
│   c.ts, cpp.ts     config only    │             parsing                    │
├───────────────────────────────────┴────────────────────────────────────────┤
│ parsers/   pure functions, text → Finding                                  │
│   sanitizers.ts  diagnostics.ts  crash.ts  frames.ts                       │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   │ spawn (no shell), stdin closed, timeout
                     clang / gcc · sanitizer runtimes · lldb · user's program
```

### Directory map

| Path | Role |
| --- | --- |
| `src/index.ts` | Entry point. `--root` > `LOWDBG_ROOT` > cwd. Logs to stderr only (stdout is the protocol). |
| `src/server.ts` | MCP surface: tool schemas and descriptions, the `debug` prompt, error mapping. |
| `src/core/types.ts` | The vocabulary and both extension contracts. Start reading here. |
| `src/core/pipeline.ts` | `runBuild`, `runAnalyze`, `runStatic`, `runDebug`; finding ranking. |
| `src/core/workspace.ts` | `openWorkspace`, `resolveInRoot`, `locateFile`, `readSnippet`, `enrichFindings`. |
| `src/core/exec.ts` | `exec`, `baseEnv`, `which`, `tail`. |
| `src/core/format.ts` | Rendering and noise filtering. |
| `src/languages/` | `clang-family.ts` (the real adapter), `c.ts` / `cpp.ts` (config), `index.ts` (registry, detection). |
| `src/debuggers/` | `lldb.ts`, `index.ts` (registry). |
| `src/parsers/` | Language-agnostic text parsers. |
| `test/` | Parser unit tests, ground-truth evaluation, debugger, MCP, workspace tests, and fixtures. |

About 1,900 lines of TypeScript in `src/`. Runtime dependencies are only the MCP SDK and zod.

## 4. Data model

Everything a tool produces is normalised into a few types in [`core/types.ts`](../src/core/types.ts), so
the formatter, enrichment and MCP layer never branch on language or tool.

**`Finding`**: one problem.

| Field | Meaning |
| --- | --- |
| `kind` | `compile-error`, `compile-warning`, `static-analysis`, `memory-error`, `undefined-behavior`, `memory-leak`, `data-race`, `deadlock`, `crash`, `assertion`, `timeout` |
| `severity` | `error` or `warning` |
| `source` | Producing tool: `asan`, `ubsan`, `tsan`, `lsan`, `clang`, `clang-analyzer`, `linker`, `libc`, `runtime` |
| `title`, `detail` | One-line headline; supporting facts (access size, "0 bytes after 4-byte region", the owning variable) |
| `frames` | The primary stack, innermost first |
| `sections` | Labelled secondary stacks: "freed by thread T0", "allocated by", "previous write by main thread" |
| `trace` | Explanation steps from the static analyzer ("'a' initialized to a null pointer value") |
| `primary` | *Set by enrichment:* the first frame inside the workspace, i.e. where to look |
| `snippet` | *Set by enrichment:* numbered source lines around `primary` |

**`Frame`**: `function`, `file`, `line`, `column`, `module`, and `inUserCode` (set by enrichment).

The split between what adapters produce and what enrichment adds is deliberate. An adapter only has to
report raw `file:line` frames in whatever form its tool printed them. Deciding which frame is the user's,
resolving paths, and cutting snippets happen once, in `core/workspace.ts`, for every language.

**Two contracts** let the system grow. Their full signatures are in `types.ts`.

- `LanguageAdapter`: `toolchain`, `build`, `run`, optional `staticAnalyze`, plus metadata (`id`,
  `extensions`, `profiles`, default profiles, `guidance`, preferred `debuggers`).
- `DebuggerBackend`: `available`, `run(DebugRequest) → DebugResult`, where a result is a list of `Stop`s,
  each with a reason, frames-with-locals, and the output of any user commands.

**Profiles** are named build/instrumentation configurations declared by each adapter (for C/C++:
`asan-ubsan`, `tsan`, `debug`, `optimized`). The server does not interpret them; it passes the id through.
This is what lets a Rust adapter offer `miri` or a Verilog adapter offer `lint` without any core change.

## 5. How a request flows

### 5.1 `analyze`

```mermaid
sequenceDiagram
    participant C as MCP client
    participant S as server.ts
    participant P as pipeline.ts
    participant A as ClangFamilyAdapter
    participant X as exec.ts
    participant W as workspace.ts
    C->>S: analyze({sources, args, stdin, profile?})
    S->>S: zod validation (defaults, ranges)
    S->>P: runAnalyze(ctx, input)
    P->>P: chooseAdapter (language or file extensions)
    P->>A: build(profile)
    A->>A: probe: does this compiler support the profile?
    A->>X: clang <profile flags> -Wall -Wextra src -o .lowdbg/build/<profile>/<name>
    X-->>A: stderr diagnostics
    A-->>P: BuildResult {ok, program, diagnostics}
    alt build failed
        P-->>S: diagnostics only, program not run
    else build ok
        P->>A: run(program, args, stdin, timeout)
        A->>X: spawn with sanitizer env, stdin closed, new process group
        X-->>A: exit code/signal, stdout, stderr
        A->>A: parse stderr → Finding[]; else assertion; else signal → crash; timeout → timeout
        A-->>P: RunResult
        P->>W: enrichFindings (locate files, mark user frames, snippets)
        P->>P: rank by kind
    end
    P-->>S: AnalyzeResult
    S->>S: formatAnalyze → markdown
    S-->>C: text content (or isError with a readable message)
```

Key behaviours:

- **Build failure short-circuits.** The program is not run; compiler errors with locations are returned.
- **Sanitizer output wins.** Crash-by-signal and assertion detection only run when no sanitizer report was
  parsed, so one failure is not reported twice (ASan converts a SEGV into its own report).
- **Timeouts are findings.** A hang becomes a `timeout` finding, not a tool error, so the model can react.
- **Ranking.** Compile errors, then memory errors, races/deadlocks, UB, assertions/crashes, timeouts,
  leaks, static findings, warnings. UBSan often reports before ASan aborts on the same line; ranking puts
  the memory error first.

### 5.2 `debug`

1. Build with the chosen profile (default `debug`: plain `-O0 -g`) unless a prebuilt `program` was given.
2. Pick the first available backend from the adapter's `debuggers` list.
3. If the profile is a sanitizer profile and `breakOnSanitizerError` is on, add a function breakpoint on
   `__asan_on_error`. The program stops *inside* the sanitizer's error handler, alive, with the faulty
   frame's locals intact.
4. The LLDB backend generates a script (section 6.5), runs it in batch mode, and parses the transcript
   into `Stop`s.
5. Frames are enriched (user-code marking), then formatted: runtime frames collapse to one line; user
   frames list their locals.

### 5.3 `static_analyze`

Runs `clang --analyze -Xclang -analyzer-output=text` (or `gcc -fanalyzer -c`) with the same diagnostics
parser as the build. Analyzer `note:` lines become `Finding.trace` steps. The result is filtered to
analyzer checkers and hard errors, so ordinary compiler warnings are left to `build`.

## 6. Component reference

### 6.1 `core/exec.ts`: bounded process execution

Every external program runs through one function. Properties, each there for a reason:

| Property | Reason |
| --- | --- |
| `spawn` with an argument array, never a shell | Model-supplied strings cannot be interpreted as shell syntax. (The one deliberate exception is `buildCommand`, which is a shell command by design.) |
| `stdin` closed unless text is supplied | Debuggers and interactive programs otherwise block forever waiting on it. This was the cause of the first hang during development. |
| `detached: true` and kill of the whole process group on timeout or exit | A timeout must also kill a debugger's inferior and any grandchildren, which would otherwise hold the pipes open. |
| Per-stream 2 MB cap, `truncated` flag | A program that prints in a loop cannot exhaust memory. |
| `baseEnv()` allow-list: `PATH`, `HOME`, `TMPDIR`, `LANG`, `LC_ALL`, `SDKROOT`, `DEVELOPER_DIR`, `CC`, `CXX` | The child does not inherit the host's full environment (tokens, credentials). |

### 6.2 `core/workspace.ts`: the workspace boundary and path resolution

**Confinement.** `openWorkspace` resolves the root with `realpath` once (important on macOS, where `/tmp`
and `/var` are symlinks). `resolveInRoot` resolves any candidate with `realpath` and checks it is inside
the root, so `..` traversal, absolute paths elsewhere, and symlinks pointing out are all refused.
`requireInRoot` throws a message the model can act on.

**Scratch space.** Build outputs go to `<root>/.lowdbg/`, which contains its own `.gitignore` (`*`), so it
never shows up in version control and nothing is written outside the root.

**Locating files named by tools.** Tools disagree on how they print paths: Linux symbolizers print the path
given to the compiler, macOS prints only the basename. `locateFile` tries, in order:

1. the path as given (inside the root);
2. the source files that were compiled (suffix match);
3. a **unique** basename match over a bounded index of the workspace (skips `node_modules`, `.git`,
   `.lowdbg`, `target`, `build`, `dist`, dot-directories; capped at 20,000 files).

Ambiguity returns nothing rather than guessing, and absolute paths outside the root (system headers,
libraries) never resolve. That is how a frame gets classified as user code or library.

**Enrichment** (`enrichFindings`) marks each frame `inUserCode`, rewrites its path relative to the root,
chooses `primary` as the first user frame with a line, and attaches a 7-line snippet. It is idempotent and
language-agnostic.

### 6.3 `parsers/`: text to `Finding`

Parsers are **pure functions of text**. They do not spawn anything, so they are tested on captured output
and are reusable by any adapter whose toolchain prints the same format.

| Parser | Input | Notes |
| --- | --- | --- |
| `frames.ts` `parseFrameLine` | One stack line | Handles ASan form (`#0 0x… in fn file:line:col`), TSan form (`#0 fn file:line:col (mod+0x…)`), C++ signatures containing spaces, `(module+0xoff)`-only frames, `<null>` placeholders, macOS basename-only paths. The `+0x` requirement distinguishes a module suffix from a C++ parameter list. |
| `sanitizers.ts` | Sanitizer stderr | A small state machine. **ASan:** bug type from the header, access line and region description as `detail`, first frame block as `frames`, then `freed by` / `allocated by` / `frame that owns the variable` as `sections`; stack-variable object tables are kept. **UBSan:** one finding per `runtime error:` line, merged with a following stack trace, de-duplicated (a loop would otherwise repeat it). **LSan:** one finding per leak block. **TSan:** the two racing accesses, `Location is …`, and thread creation stacks; lock-order inversions become `deadlock`. |
| `diagnostics.ts` | GCC/Clang diagnostics | `file:line:col: error\|warning\|note:`. Notes attach to the preceding diagnostic as `trace`. The analyzer's trailing echo of its own warning is dropped (compared with the `[checker]` suffix removed). Linker failures (`undefined reference`, `Undefined symbols for architecture`, …) become one `Linker error` finding. |
| `crash.ts` | stderr / signal | Assertion failures in the BSD/macOS and glibc formats; signal names with a human hint (SIGSEGV, SIGABRT, SIGFPE, …). |

### 6.4 `languages/clang-family.ts`: the C and C++ adapter

One class implements `LanguageAdapter`; `c.ts` and `cpp.ts` are configuration (compiler candidates and
env override, extensions, flag variable, guidance text).

**Profiles**

| Id | Flags | Purpose |
| --- | --- | --- |
| `asan-ubsan` | `-g -O0 -fno-omit-frame-pointer -fsanitize=address,undefined` | Default for `analyze`. Memory errors and UB. |
| `tsan` | `-g -O1 -fno-omit-frame-pointer -fsanitize=thread` | Races. Cannot be combined with ASan. |
| `debug` | `-g -O0 -fno-omit-frame-pointer` | Default for `debug`. Honest variable values. |
| `optimized` | `-g -O2 -fno-omit-frame-pointer` | Reproduce bugs that only exist when optimized. |

**Capability probing.** Before a profile is used, the adapter compiles a trivial program with its flags
(cached per process). An unsupported profile produces a clear error rather than a confusing compiler
failure, and `toolchain_info` reports the same results.

**Build modes**

- *Sources mode:* `compiler <profile flags> -Wall -Wextra <user flags> <sources> -o .lowdbg/build/<profile>/<name>`,
  run from the root with sources passed as root-relative paths so tool output stays root-relative where
  the platform allows.
- *Command mode:* `sh -c <buildCommand>` with `CC`/`CXX`, `CFLAGS`/`CXXFLAGS` (profile + user flags) and
  `LDFLAGS` (sanitizer flags) in the environment. The user supplies `program`. This is the route for
  Makefile projects; the Makefile must honor those variables.

**Run.** The program runs from the root with a profile-specific sanitizer environment
(`ASAN_OPTIONS=detect_stack_use_after_return=1:symbolize=1:print_summary=1`, plus `detect_leaks=1` on
Linux only; `UBSAN_OPTIONS=print_stacktrace=1`; `TSAN_OPTIONS`). Classification, in order: sanitizer
reports; else an assertion; else death by signal; plus a `timeout` finding if the deadline was hit.

### 6.5 `debuggers/lldb.ts`: driving LLDB non-interactively

The backend generates an LLDB script, runs `lldb --batch --no-lldbinit`, and parses the transcript.

**Script shape**

```
settings set frame-format "<custom>"      # full file paths, no backtick, one frame per line
breakpoint set --file F --line N [--condition C]
breakpoint set --name __asan_on_error     # sanitizer profiles
process launch -w <root> [-i <stdin file>] [-- args]
command source -e false -s false <inspect.lldb>      # stop 1
continue
command source -e false -s false <inspect.lldb>      # stop 2 ... up to maxStops
process kill
quit
-k "command source …"  -k "process kill"  -k quit     # crash handler
```

`inspect.lldb` holds the per-stop block: `thread backtrace -c N`, then `frame select k` /
`frame variable` for k in 0..frameDepth-1, `frame select 0`, then the user's raw `commands`.

**Why it is shaped this way.** Two LLDB batch-mode behaviours drove the design (details in section 8):

1. A failing command aborts the rest of an `-o` sequence. The inspect block selects frames that may not
   exist, so it runs under `command source -e false`, which continues past errors. As a bonus, a user's
   mistyped expression no longer ruins the session.
2. When the inferior crashes, LLDB discards the remaining `-o` commands. The same inspect block is
   therefore also registered as a crash handler with `-k`.

**Parsing.** The transcript is split on echoed `(lldb) <command>` prompts. Commands are classified from
what the script itself generated (an `internal` set); anything else in a stop group is user output. A
`launch` or `continue` section starts a new stop group; its `stop reason = …` text becomes the stop reason
(a section without one means the program exited). Backtrace lines and `(type) name = value` variables are
parsed with regexes into `DebugFrame`s. A `breakpoint set` that reports "no locations (pending)" becomes a
warning, so a typo'd line number is not mistaken for "the program never got there".

Stdin text is written to a temp file (outside the workspace) and passed with `-i`; the temp directory is
removed afterwards.

### 6.6 `core/format.ts`: results for a model, not a terminal

Structured results are rendered to compact markdown, because the consumer is an LLM with a finite context.

- Findings are ordered by severity and show *where*, the *snippet*, *detail*, the analyzer *path*, the
  *stack*, and labelled sections.
- **Noise filtering.** Frames from sanitizer runtimes, `dyld`, `libsystem_*`, libc, and the like are hidden
  (`NOISE_MODULE`), as is the redundant single-frame "Stack:" for diagnostics. Raw data still contains
  them; only the rendering is trimmed.
- **Debug view.** Frames before the first user frame collapse to "frames #0-#N are runtime/library
  internals"; user frames list locals.
- **Honesty text.** A clean run says it does not prove correctness and suggests `optimized` / `tsan`.
- **Caps.** 24,000 characters total, 10 frames per stack (6 per secondary section), and tails for
  stdout/stderr. When a report could not be parsed, the stderr tail is included so nothing is lost.

### 6.7 `server.ts`: the MCP surface

| Tool | Key inputs | Limits |
| --- | --- | --- |
| `analyze` | `sources` or `buildCommand`+`program`, `flags`, `profile`, `args`, `stdin`, `env`, `timeoutSec` | timeout 1-300 s, default 20 |
| `debug` | the above, plus `breakpoints[{file,line,condition}]`, `breakOnSanitizerError`, `commands`, `maxStops`, `frameDepth` | timeout 5-300 s, default 60; `maxStops` 1-10; `frameDepth` 1-16 (default 8 on a sanitizer stop, else 4) |
| `static_analyze` | `sources`, `flags` | build timeout 300 s |
| `build` | `sources`/`buildCommand`, `flags`, `profile` | 300 s |
| `read_source` | `file`, `startLine`, `endLine` | at most 400 lines per call, root-confined |
| `toolchain_info` | none | compiles one probe per profile (cached) |

Design points:

- **Parameter descriptions are part of the interface.** They are what the model reads to decide how to
  call the tool (for example, the `condition` description gives a C-expression example). A test asserts
  they exist.
- **Errors are tool results.** Handlers are wrapped so exceptions (bad path, unknown profile, missing
  tool) return `isError: true` with a readable message instead of a protocol error. Schema violations
  (for example `maxStops: 99`) are rejected by zod before any work happens.
- **The `debug` prompt** is generated from the registered adapters, so a new language's profiles and
  advice appear in the workflow text automatically.

## 7. Design decisions

Each entry: the choice, the reason, and what it costs.

| # | Decision | Why | Cost / alternative |
| --- | --- | --- | --- |
| 1 | **MCP server, not a Zed extension.** | Zed's extension API is WASM and cannot add arbitrary UI or spawn processes freely, but it can load MCP servers, and the Agent panel already supplies chat, diffs and approvals. The same server then works in Claude Code, Cursor and others. | No bespoke Zed UI (inline squiggles from findings). A thin WASM extension that launches this server remains possible. |
| 2 | **No LLM inside the server.** | The deterministic half becomes unit-testable and measurable. The model is swappable and not billed twice. | Anything needing model judgment (ranking hypotheses) is left to the client. |
| 3 | **Evidence from real tools, not source reading.** | Sanitizers and debuggers know things the text does not contain (allocation sites, live values). It also yields a verification signal. | Findings are limited to what the tools can observe on the executed path. |
| 4 | **One normalised `Finding`.** | Decouples producers from consumers; the formatter and enrichment are written once. | The type must stay general enough for hardware/Rust later; `kind` is a closed union that may need extending. |
| 5 | **Parsers are pure functions over text.** | Testable with captured output, no toolchain needed; shared across languages that print LLVM sanitizer reports. | Text scraping is brittle against format changes. Mitigated by tests on real captured output, and by falling back to raw stderr when nothing parses. |
| 6 | **Adapter does build+run+parse; core does path/snippet/rank.** | Keeps the adapter small and the cross-cutting logic in one place. | Adapters cannot customise enrichment (not needed so far). |
| 7 | **Shared `ClangFamilyAdapter`; C and C++ are config.** | Same compilers, runtimes and diagnostics. C++ cost about 20 lines, which doubles as a test of the extension design. | The abstraction is shaped by clang; non-clang languages will use `LanguageAdapter` directly. |
| 8 | **Profiles are opaque strings owned by the adapter.** | Lets each language expose what is natural (`miri`, `lint`) with no core change. | The model must learn per-language profiles; `toolchain_info` and the prompt list them. |
| 9 | **Probe each profile before use.** | Fails with a clear message instead of a cryptic linker error; powers `toolchain_info`. | One extra tiny compile per profile, cached. |
| 10 | **LLDB in batch mode with a generated script, not DAP/MI.** | Works with only an `lldb` binary, no session state to manage, easy to bound with a timeout. Gives backtraces, locals, expressions, watchpoints. | Stateless: no interactive stepping across tool calls. Transcript parsing is regex-based. A DAP or MI backend can replace it behind the same interface. |
| 11 | **Stop at `__asan_on_error`.** | Gets the live values at the moment of the sanitizer error (`i = 4`) without hand-picking a breakpoint. | Sanitizer-specific; UBSan stops are caught by LLDB's own instrumentation support instead. |
| 12 | **Result text is markdown, not JSON.** | The consumer is a model; compact, ordered prose with snippets costs fewer tokens and reads better than nested JSON. Structured data still exists inside the process for tests. | Clients that want machine-readable output do not get it yet (MCP `structuredContent` could be added). |
| 13 | **Confine everything to one root; use `realpath`.** | The server executes code and reads files on behalf of a model; the blast radius of a bad path should be one directory. | Projects that include headers from outside the root still compile (the compiler does that), but those frames are treated as library code. |
| 14 | **Path resolution by "tried in order, never guess".** | macOS prints basenames; guessing between two `util.h` files would send the model to the wrong place. | A genuinely ambiguous basename yields no snippet. |
| 15 | **Timeouts and caps are mandatory, everywhere.** | A model will eventually run an infinite loop or a print flood. | Long legitimate runs need an explicit larger `timeoutSec`. |
| 16 | **Minimal child environment.** | Compiled programs and debugger commands run with the user's privileges; do not also hand them every token in the environment. | A program needing extra variables must receive them through `env`. |
| 17 | **TypeScript on Node, `pnpm`.** | Matches the surrounding repository's templates; the official MCP SDK is TypeScript. | Process-heavy glue could equally be Python or Rust. |
| 18 | **Ground-truth fixtures as the accuracy measure.** | Without an LLM in the loop, "does the tool find the planted bug at the marked line" is a meaningful, repeatable metric. | Planted bugs are small; real bugs are messier. Add a fixture whenever reality disagrees. |

## 8. Platform behaviour we had to learn

These were found by running the tools, and each one changed the code.

| Observation | Consequence |
| --- | --- |
| **macOS sanitizer frames carry only the basename** (`use-after-free.c:11`), because the symbolizer is `atos`. | `locateFile` with compiled-source hints and a unique-basename index. Without it, every user frame was misclassified as library code and no snippet was produced. |
| **LLDB `--batch` aborts remaining `-o` commands after any command error.** `frame select 5` with only two frames killed the user's later commands. | Inspection runs via `command source -e false`. The setting `interpreter.stop-command-source-on-error` does *not* affect `-o` commands (tested). |
| **LLDB `--batch` drops remaining `-o` commands when the inferior crashes** (EXC_BAD_ACCESS, UBSan stop). | The same inspection is registered with `-k` as a crash handler. (`-K` takes a *file*; `-k` takes a one-liner.) |
| **LLDB blocks on stdin after a crash** if stdin is a terminal or pipe. | stdin is always closed or fed from a file. |
| **A backtick in `frame-format` starts expression evaluation** in LLDB's command line. | The custom frame format avoids the module-name backtick. A doubled backslash from generic quoting broke `\n`, so the format is emitted without the generic quoter. |
| **LLDB recognises UBSan itself** and stops with reasons like "Out of bounds index", with the runtime between frame 0 and user code. | The formatter collapses leading runtime frames. |
| **Apple clang has no LeakSanitizer.** | `toolchain_info` states leak detection is unavailable; LSan is not enabled on macOS. The parser exists for Linux. |
| **TSan on macOS aborts (SIGABRT) after reporting.** | Not treated as a separate crash: sanitizer findings suppress signal-based crash detection. |
| **The static analyzer prints the warning first, then its path as notes, then repeats the warning** as the last note. | Notes attach to the preceding diagnostic; the trailing echo is removed. |

## 9. Safety and security model

lowdbg's job is to compile and run code, so the honest model is: **it can do anything the user can do in
the workspace.** The controls reduce accidents; they are not a sandbox.

What is enforced:

- All file paths from tool input must resolve (via `realpath`) inside the configured root.
- No shell is used for compiler, debugger or program execution (except the user-requested `buildCommand`).
- Child processes get an allow-listed environment.
- Every process has a timeout and bounded output; the whole process group is killed.
- Build artifacts live under `<root>/.lowdbg/`, self-ignored.
- Tool errors and untrusted tool output are returned as data. Compiler diagnostics and program output can
  contain arbitrary text, including text that looks like instructions; the formatter only quotes it.

What is not enforced:

- **Program execution is unrestricted.** A buggy or malicious program in the workspace runs with the
  user's privileges, with network access.
- **Debugger `commands` can call functions** (LLDB `expression`), also with those privileges.
- `buildCommand` is an arbitrary shell command.
- Compiler flags passed by the model are not filtered.

Recommendation: run the server only on code you would run anyway, set `--root` to the project (never
`$HOME`), and rely on the MCP client's approval prompts for tool calls. A container or VM is the right
boundary for untrusted code; adding one around `exec` is a contained change if needed.

## 10. Testing strategy

79 tests, about 12 seconds. They run against the real toolchain; fixtures are copied to a fresh temp
directory per test file so files can run in parallel without sharing build outputs (and so the root is a
real macOS symlinked temp path, exercising `realpath` handling).

| Layer | File | What it proves |
| --- | --- | --- |
| Parsers | `parsers.test.ts` | Linux- and macOS-format reports, C++ signatures, module-only frames, TSan, LSan, UBSan de-duplication, assertion formats, diagnostics with notes, linker errors, LLDB transcript splitting, backtrace, variables, stop assembly, unresolved-breakpoint warning. |
| Accuracy | `c-eval.test.ts` | 17 C programs (16 with a `// BUG` marker) run through the real pipeline. For each planted bug: right `kind`, matching title, and `primary.line` equal to the marked line; the snippet contains the marker. Also: correct code reports nothing; input-dependent bugs appear only with the triggering input; timeouts kill the program; compile and link errors surface; unknown profiles and out-of-root paths are rejected; command-mode (Makefile) builds work. |
| Static | same file | Null dereference with its explanation path; uninitialized read; clean code is quiet. |
| Debugger | `debug.test.ts` | Crash inspection with the null variable visible; sanitizer-stop locals (`i == 4`); breakpoint + stdin + user commands, surviving a failing command; conditional breakpoint (`i == 3` gives `sum == 5`); multi-stop sampling (`i` = 0, 1, 2); normal exit; unresolved breakpoint warning; prebuilt binary; build failure; hung-session kill. |
| Languages | `cpp.test.ts` | Extension-based selection, mixed C/C++, explicit language, unknown language; a `std::vector` overflow through the shared adapter. |
| Workspace | `workspace.test.ts` | Traversal, absolute-path and symlink escapes refused; basename resolution; ambiguity refused; snippets. |
| Protocol | `server.test.ts` | Tool and prompt registration, parameter descriptions present, full `analyze` over MCP, error mapping, schema rejection, `read_source`. |

Mutation check performed during development: breaking line-number parsing failed 6 evaluation tests;
disabling the macOS basename fallback failed 7.

What the tests do not cover: Linux and gcc runs, gdb, real LeakSanitizer output, an actual Zed session,
large real-world projects.

## 11. Limitations and roadmap

### Known limitations

- Dynamic analysis only sees executed paths; bugs that need other inputs or timing are missed.
- ASan and TSan cannot be combined; memory bugs and races need separate runs.
- The debugger is stateless across calls; there is no interactive stepping session.
- A hang yields a `timeout` finding but no stack of where it is stuck (see roadmap).
- Heisenbugs that vanish under instrumentation (some races, layout-dependent corruption) are out of reach.
- Output is capped; very large reports are truncated with a marker.
- Parsers depend on sanitizer and LLDB text formats, which vary by version and platform.

### Suggested order of work

1. **Run it inside Zed** and fix what a real client exposes (working directory, prompt surfacing, approval
   flow).
2. **Linux CI** with gcc and gdb: validates LeakSanitizer, glibc assertion output, and Linux symbolizer
   paths, and turns the "not verified" list into tests.
3. **gdb backend** behind `DebuggerBackend` (GDB/MI is the sturdier route than scraping).
4. **CMake / `compile_commands.json`** so most real projects work without a hand-written `buildCommand`.
5. **Attach-on-hang:** on timeout, interrupt the process under LLDB and report the stack, turning `timeout`
   from "something is stuck" into "stuck at this line, holding this lock".
6. **Rust adapter** (reuses the sanitizer parser; adds panic and Miri parsers). See EXTENDING.md.
7. **Verilog adapter** plus a waveform query interface, the biggest design extension (the debugger contract
   is process-centric).
8. **Structured MCP output** (`structuredContent`) alongside the markdown, for clients that want to render
   findings as editor diagnostics.
9. **Optional sandbox** around `exec` (container or `sandbox-exec`) for untrusted code.

### Open questions

- Should findings be pushed to the editor as diagnostics (needs an LSP or extension path), or stay
  conversational?
- How much of the verification loop should the server own (for example a `verify` tool that re-runs the
  last `analyze` and diffs findings), versus leaving it to the model?
- What is the right evaluation beyond planted bugs: real CVE reproductions, or bugs mined from issue
  trackers, scored on whether the model's final patch passes the original failing check?
