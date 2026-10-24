import { ClangFamilyAdapter } from "./clang-family.js";

/** C++ reuses the whole clang-family pipeline; only the compiler and advice differ. */
export const cppAdapter = new ClangFamilyAdapter({
  id: "cpp",
  displayName: "C++",
  extensions: [".cc", ".cpp", ".cxx", ".c++"],
  compilerEnv: "CXX",
  compilers: ["clang++", "g++", "c++"],
  flagsEnv: "CXXFLAGS",
  guidance: [
    "C++-specific advice:",
    "- Sanitizer stacks include template and STL frames; focus on the first frame in the user's code (`primary`).",
    "- Iterator invalidation, dangling references to temporaries and use-after-move show up as ASan heap-use-after-free or stack-use-after-scope.",
    "- Pass the right standard with flags, e.g. [\"-std=c++20\"].",
  ].join("\n"),
});
