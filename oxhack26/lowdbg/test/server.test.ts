import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { hasClang, makeWorkspace } from "./helpers.js";

async function connect() {
  const ctx = makeWorkspace();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(ctx).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}

const textOf = (r: unknown) => ((r as { content: { text: string }[] }).content[0]!.text);

describe("MCP surface", () => {
  it("exposes the tools and the workflow prompt", async () => {
    const client = await connect();
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(["analyze", "build", "debug", "read_source", "static_analyze", "toolchain_info"]);
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
    expect(prompts).toEqual(["debug"]);
    const p = await client.getPrompt({ name: "debug", arguments: { problem: "crash on startup" } });
    const body = (p.messages[0]!.content as { text: string }).text;
    expect(body).toContain("crash on startup");
    expect(body).toContain("asan-ubsan");
    expect(body).toContain("C++-specific advice");
  });

  it("describes every parameter so a model can use them", async () => {
    const client = await connect();
    const analyze = (await client.listTools()).tools.find((t) => t.name === "analyze")!;
    const props = analyze.inputSchema.properties as Record<string, { description?: string }>;
    for (const key of ["sources", "flags", "profile", "stdin", "args", "timeoutSec"]) {
      expect(props[key]?.description, key).toBeTruthy();
    }
  });

  it.skipIf(!hasClang)("analyze returns a readable report with the buggy line", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "analyze", arguments: { sources: ["c/heap-overflow.c"] } });
    const out = textOf(r);
    expect(r.isError).toBeFalsy();
    expect(out).toContain("heap-buffer-overflow");
    expect(out).toContain("c/heap-overflow.c:6");
    expect(out).toContain("> 6 |");
    expect(out).toContain("allocated by");
  });

  it("returns tool errors instead of throwing", async () => {
    const client = await connect();
    const outside = await client.callTool({ name: "read_source", arguments: { file: "../../etc/hosts" } });
    expect(outside.isError).toBe(true);
    expect(textOf(outside)).toMatch(/outside the workspace/);
    const bad = await client.callTool({ name: "analyze", arguments: { sources: ["c/clean.c"], profile: "bogus" } });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toMatch(/Unknown profile/);
  });

  it("rejects malformed input at the schema", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "debug", arguments: { sources: ["c/clean.c"], maxStops: 99 } }).catch((e: Error) => e);
    const failed = r instanceof Error || (r as { isError?: boolean }).isError;
    expect(failed).toBe(true);
  });

  it("reads a source range", async () => {
    const client = await connect();
    const out = textOf(await client.callTool({ name: "read_source", arguments: { file: "c/clean.c", startLine: 4, endLine: 6 } }));
    expect(out.split("\n")).toHaveLength(3);
    expect(out).toContain("int main(void)");
  });

  it("toolchain_info reports the machine's reality", async () => {
    const client = await connect();
    const out = textOf(await client.callTool({ name: "toolchain_info", arguments: {} }));
    expect(out).toContain("Workspace root");
    expect(out).toContain("## Debuggers");
  });
});
