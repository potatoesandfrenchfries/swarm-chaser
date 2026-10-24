import { describe, expect, it } from "vitest";
import { chooseAdapter } from "../src/languages/index.js";
import { runAnalyze } from "../src/core/pipeline.js";
import { bugLines, findAt, hasClang, makeWorkspace } from "./helpers.js";

const ctx = makeWorkspace();

describe("language selection", () => {
  it("infers the adapter from extensions", () => {
    expect(chooseAdapter(undefined, ["a.c"]).id).toBe("c");
    expect(chooseAdapter(undefined, ["a.cpp"]).id).toBe("cpp");
    expect(chooseAdapter(undefined, ["a.cc", "b.CXX"]).id).toBe("cpp");
  });
  it("sends mixed C/C++ builds through the C++ driver", () => {
    expect(chooseAdapter(undefined, ["a.c", "b.cpp"]).id).toBe("cpp");
  });
  it("honours an explicit language and rejects unknown ones", () => {
    expect(chooseAdapter("c", ["weird.txt"]).id).toBe("c");
    expect(() => chooseAdapter("cobol", [])).toThrow(/Unknown language/);
    expect(() => chooseAdapter(undefined, ["main.rs"])).toThrow(/Cannot infer language/);
  });
});

describe.skipIf(!hasClang)("C++ adapter (reuses the clang-family pipeline)", () => {
  it("finds a std::vector overflow and locates it in user code", async () => {
    const r = await runAnalyze(ctx, { sources: ["cpp/vector-oob.cpp"], flags: ["-std=c++17"], args: [], env: {} });
    expect(r.adapter.id).toBe("cpp");
    const hit = findAt(r.run!.findings, bugLines(ctx.root, "cpp/vector-oob.cpp"));
    expect(hit?.title).toMatch(/heap-buffer-overflow/);
  });
});
