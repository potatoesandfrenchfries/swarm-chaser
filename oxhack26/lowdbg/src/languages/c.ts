import { ClangFamilyAdapter } from "./clang-family.js";

export const cAdapter = new ClangFamilyAdapter({
  id: "c",
  displayName: "C",
  extensions: [".c"],
  compilerEnv: "CC",
  compilers: ["clang", "gcc", "cc"],
  flagsEnv: "CFLAGS",
  guidance: [
    "C-specific advice:",
    "- Most C bugs are memory errors or undefined behavior. Start with `analyze` (asan-ubsan); it names the exact line and, for heap bugs, where the memory was allocated and freed.",
    "- If `analyze` is clean but the program still misbehaves, try profile `optimized` (UB often only shows with -O2), then `tsan` if the program uses threads.",
    "- Uninitialized reads are not caught by ASan/UBSan. `static_analyze` and -Wall -Wextra -Wuninitialized warnings in the build output are the best signal.",
    "- Integer promotion, signed/unsigned comparison and size_t underflow cause many 'impossible' crashes; check types around the primary line.",
  ].join("\n"),
});
