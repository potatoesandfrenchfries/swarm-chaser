# lowdbg

An [MCP](https://modelcontextprotocol.io) server that gives an AI agent real debugging tools for low-level
languages: build with sanitizers, run, parse the report, inspect state in a debugger, run static analysis.
C and C++ today; the architecture is built so Rust, Zig, Verilog and others slot in.

The point is that the model **does not guess from source text**. It reproduces the bug, reads structured
evidence (the exact line, the allocation and free sites, live variable values), fixes, and re-runs the same
check to confirm. Zed, Claude Code, Cursor and anything else that speaks MCP can drive it.

```
 editor / agent ──MCP──▶  server.ts          six tools + one workflow prompt
                           │
                           ▼
                        core/pipeline.ts      build → run → parse → rank → attach source snippets
                           │
          ┌────────────────┴─────────────────┐
          ▼                                  ▼
  LanguageAdapter  (languages/)       DebuggerBackend  (debuggers/)
   c, cpp ─ ClangFamilyAdapter         lldb  (gdb / DAP: add here)
          │
          ▼
  parsers/  sanitizers · diagnostics · crash · frames      pure text → Finding, shared across languages
```

## Tools

| Tool | What it does |
| --- | --- |
| `analyze` | **Main tool.** Build with ASan+UBSan (or `tsan`, `optimized`, `debug`), run with your args/stdin, return ranked findings: memory errors with allocation/free stacks, UB, races, crashes, assertions, hangs. Each has the primary source line and a snippet. |
| `debug` | Run under LLDB. Reports each stop with a backtrace and **locals of each user-code frame**. With `asan-ubsan` it stops *inside* the sanitizer error with the program alive. Supports conditional breakpoints, `maxStops`, stdin, and raw debugger `commands` (`p *node`, `x/16xb buf`, `watchpoint set variable n`). |
| `static_analyze` | `clang --analyze` (or `gcc -fanalyzer`): the *path* to the bug, without running anything. Catches null derefs and uninitialized reads on paths the run didn't take. |
| `build` | Compile and return structured diagnostics (errors, `-Wall -Wextra` warnings, linker errors). |
| `read_source` | Numbered line range, confined to the workspace. |
| `toolchain_info` | What is actually installed and which profiles work on this machine. |

The `debug` MCP prompt carries the recommended workflow (reproduce → read → inspect → fix → re-verify) plus
per-language advice, so editors that surface MCP prompts (Zed shows them as slash commands) get it for free.

Example `analyze` output for a use-after-free:

```
### 1. AddressSanitizer: heap-use-after-free  [memory-error · asan]
Where: main at c/use-after-free.c:11
READ of size 4 at 0x6020000000d0 thread T0
   10 |     free(n);
>  11 |     printf("%d\n", n->value); // BUG
freed by thread T0:
    #1 main at c/use-after-free.c:10
previously allocated by thread T0:
    #1 main at c/use-after-free.c:7
```

## Use it

```sh
pnpm install && pnpm build
node dist/index.js --root /path/to/your/project      # or LOWDBG_ROOT=...; defaults to cwd
```

**Zed** (`settings.json`, or `.zed/settings.json` per project):

```json
{
  "context_servers": {
    "lowdbg": {
      "command": "node",
      "args": ["/abs/path/to/lowdbg/dist/index.js", "--root", "/abs/path/to/your/project"]
    }
  }
}
```

**Claude Code:** `claude mcp add lowdbg -- node /abs/path/to/lowdbg/dist/index.js --root "$PWD"`

Always pass `--root` explicitly: it is the only directory the server will read, compile or debug in.
Build outputs go to `<root>/.lowdbg/` (self-ignoring).

For a Makefile/CMake project, pass `buildCommand` (e.g. `make app`) and `program`. The server runs the
command with `CC`/`CFLAGS`/`LDFLAGS` set for the chosen profile, so your Makefile must honor them
(use `$(CC) $(CFLAGS) ... $(LDFLAGS)`, and avoid hard-assigning `CC =`).

## Tests

```sh
pnpm test        # 79 tests, ~12s
pnpm typecheck
```

- `test/parsers.test.ts`: pure parser tests on canned Linux- and macOS-format reports.
- `test/c-eval.test.ts`: **ground-truth evaluation**. 17 small C programs (16 with a planted bug, the
  line marked `// BUG`). Asserts the pipeline classifies the bug *and* points at that line. This measures
  everything below the LLM; add a fixture whenever a real bug is mis-reported.
- `test/debug.test.ts`: LLDB: crash inspection, sanitizer stop, conditional/multi-stop breakpoints, stdin.
- `test/server.test.ts`: the MCP protocol surface, including tool errors and path escapes.

## What is verified, and what is not

Verified here: macOS 26 / arm64, Apple clang 21, ASan + UBSan + TSan, `clang --analyze`, LLDB.

Not verified (no Linux box in this session):
- **gcc and gdb.** gcc is a fallback compiler and `-fanalyzer` is wired up, but untested. There is no gdb backend yet.
- **LeakSanitizer.** Apple clang has no LSan. The parser is tested on a canned Linux report only, and `toolchain_info` says leak detection is unavailable on macOS.
- **Linux symbolizer output.** Parsers are tested on canned Linux-format text, not live Linux runs.
- **Zed itself.** The config above follows Zed's documented `context_servers` format, but I had no Zed to test with.

## Limits worth knowing

- **Dynamic analysis only sees what runs.** "No findings" means the exercised path is clean; the tool says so.
- **No sandbox.** `analyze` and `debug` compile and execute workspace code, and `debug` `commands` run with
  your privileges (an LLDB `expression` can call any function). Only point it at code you would run anyway.
  Child processes get a minimal environment (PATH, HOME, TMPDIR, and similar), not your full one.
- ASan and TSan are mutually exclusive, so races and memory bugs need two runs (separate profiles).
- Not yet: CMake/`compile_commands.json` awareness, attach-on-hang, core dump analysis, valgrind/MSan/rr.

How it works and why: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). To add a language or debugger: [docs/EXTENDING.md](docs/EXTENDING.md).
