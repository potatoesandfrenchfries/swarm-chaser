# Extending lowdbg

Everything above the language layer is shared: path confinement, source snippets, ranking, formatting, the
MCP tools. A new language only has to answer: *how do I build, how do I run, and how do I turn the output
into `Finding`s?*

## The two contracts

Both live in [`src/core/types.ts`](../src/core/types.ts).

**`LanguageAdapter`**: `toolchain()`, `build()`, `run()`, optionally `staticAnalyze()`, plus metadata
(`id`, `extensions`, `profiles`, default profiles, `guidance`, preferred `debuggers`). Register it in
[`src/languages/index.ts`](../src/languages/index.ts). Every tool, the workflow prompt, and language
auto-detection from file extensions then work with no further changes.

**`DebuggerBackend`**: `available()` and `run(DebugRequest) → DebugResult`. Register it in
[`src/debuggers/index.ts`](../src/debuggers/index.ts) and name its id in an adapter's `debuggers`.

Adapters produce `Finding`s with raw `file:line` frames. They do **not** need to resolve paths, find the
user's frame or attach snippets: `enrichFindings` does that for every language.

## Proof it works: C++ is 20 lines

[`languages/cpp.ts`](../src/languages/cpp.ts) is a config object for the shared
[`ClangFamilyAdapter`](../src/languages/clang-family.ts): different compiler, extensions and advice, same
sanitizer profiles, diagnostics parser, static analyzer and LLDB backend. Anything that compiles through
clang or gcc with `-fsanitize` (Zig via `zig cc`, ObjC) can reuse it the same way.

## Adding Rust (sketch)

| Piece | Mapping |
| --- | --- |
| Build | `cargo build` (or `rustc`) via `exec`; parse `rustc` diagnostics (`error[E0499]: ...` with `--> src/main.rs:5:9`). Needs a new parser; rustc's `--error-format=json` is the easiest. |
| Profiles | `debug` (plain), `asan` (`RUSTFLAGS=-Zsanitizer=address`, nightly), `miri` (`cargo +nightly miri run`: catches UB in `unsafe` that sanitizers miss), `tsan`. |
| Run | Run the binary. **Reuse `parseSanitizerOutput`** unchanged for ASan/TSan. Add a panic parser for `thread 'main' panicked at src/main.rs:7:5:` plus the `RUST_BACKTRACE=1` frames. Miri output needs its own small parser. |
| Static | `cargo clippy --message-format=json`. |
| Debugger | `rust-lldb` / the existing `LldbBackend`; set `debuggers: ["lldb"]`. |
| Guidance | Borrow-checker advice, "`unsafe` is where to look", Miri before sanitizers. |

## Adding Verilog/SystemVerilog (sketch, and where the design stretches)

| Piece | Mapping |
| --- | --- |
| Build | `verilator --lint-only -Wall` for lint diagnostics (`%Warning-WIDTH: file.sv:12:5: ...`); `verilator --binary --assert --trace` to build a simulator. Needs a Verilator diagnostic parser. |
| Profiles | `lint`, `sim` (assertions on), `sim-trace` (dump VCD). |
| Run | Run the simulation; parse assertion failures (`%Error: tb.sv:20: Assertion failed in top.dut`) into `assertion` findings. |
| Static | Verilator lint and `yosys` checks as `staticAnalyze`. |
| Debugger | **This is where the interface stretches.** `DebuggerBackend` is process-centric (breakpoints, backtraces, locals). Hardware debugging is waveform-centric: "what was `state` at t=120ns, when did `valid` fall". Either add a `WaveformBackend` that queries a VCD (a small new interface and tool), or generalize `DebugRequest`. Expect this to be the largest piece of work for HDL. |

Hardware has far less training data and its bugs are often timing/CDC/reset related, so lean on simulation
and assertions (the verification loop) more than on the model's priors.

## Checklist for a new language

1. Fixtures: 8-10 tiny programs with the bug line marked `// BUG`, as in `test/fixtures/c`. Write these
   first; they define done.
2. Parsers as pure functions in `src/parsers/`, with canned-text tests (include real output captured from
   the tool, not output you remember).
3. Adapter implementing `LanguageAdapter`; register it.
4. An eval test like `test/c-eval.test.ts`: classify the bug **and** assert the primary line.
5. `guidance` text: the language-specific debugging advice that goes into the workflow prompt.
