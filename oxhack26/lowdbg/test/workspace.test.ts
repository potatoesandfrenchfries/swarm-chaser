import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { locateFile, readRange, readSnippet, requireInRoot, resolveInRoot } from "../src/core/workspace.js";
import { makeWorkspace } from "./helpers.js";

const ctx = makeWorkspace();

describe("workspace confinement", () => {
  it("resolves paths inside the root", () => {
    expect(resolveInRoot(ctx, "c/clean.c")).toBe(path.join(ctx.root, "c/clean.c"));
  });
  it("refuses traversal and absolute paths elsewhere", () => {
    expect(resolveInRoot(ctx, "../outside.c")).toBeUndefined();
    expect(resolveInRoot(ctx, "/etc/passwd")).toBeUndefined();
    expect(() => requireInRoot(ctx, "../../x")).toThrow(/outside the workspace/);
    expect(() => readRange(ctx, "../../etc/hosts", 1, 5)).toThrow(/outside the workspace/);
  });
  it("refuses a symlink that escapes the root", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "lowdbg-outside-"));
    fs.writeFileSync(path.join(outside, "secret.c"), "int secret;\n");
    fs.symlinkSync(outside, path.join(ctx.root, "link"));
    expect(resolveInRoot(ctx, "link/secret.c")).toBeUndefined();
  });
});

describe("locateFile", () => {
  it("resolves a macOS-style basename through the compiled sources", () => {
    expect(locateFile(ctx, "heap-overflow.c", ["c/heap-overflow.c"])).toBe(path.join(ctx.root, "c/heap-overflow.c"));
  });
  it("falls back to a unique basename anywhere in the workspace", () => {
    expect(locateFile(ctx, "vector-oob.cpp")).toBe(path.join(ctx.root, "cpp/vector-oob.cpp"));
  });
  it("refuses to guess when a basename is ambiguous", () => {
    fs.mkdirSync(path.join(ctx.root, "a"), { recursive: true });
    fs.mkdirSync(path.join(ctx.root, "b"), { recursive: true });
    fs.writeFileSync(path.join(ctx.root, "a/dup.h"), "");
    fs.writeFileSync(path.join(ctx.root, "b/dup.h"), "");
    const fresh = { root: ctx.root };
    expect(locateFile(fresh, "dup.h")).toBeUndefined();
  });
  it("never resolves library paths outside the root", () => {
    expect(locateFile(ctx, "/usr/include/stdio.h")).toBeUndefined();
  });
});

describe("snippets", () => {
  it("marks the target line", () => {
    const s = readSnippet(ctx, "c/use-after-free.c", 11, { context: 1 })!;
    expect(s.split("\n")).toHaveLength(3);
    expect(s).toMatch(/^> 11 \|/m);
  });
  it("returns nothing for a line past the end", () => {
    expect(readSnippet(ctx, "c/clean.c", 5000)).toBeUndefined();
  });
});
