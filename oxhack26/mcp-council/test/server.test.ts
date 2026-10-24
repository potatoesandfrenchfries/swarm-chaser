import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCouncilServer } from "../src/index.js";
import { DEFAULT_MEMBERS } from "../src/members.js";
import { CouncilState } from "../src/state.js";
import { stubLlm } from "./stub-llm.js";

type Text = { content: { type: string; text: string }[]; isError?: boolean };
const textOf = (result: unknown) => (result as Text).content.map((c) => c.text).join("\n");

async function connect(script = {}) {
  const state = new CouncilState(DEFAULT_MEMBERS, null);
  const server = createCouncilServer({ llm: stubLlm(script).llm, state, pool: DEFAULT_MEMBERS, reapEvery: 0 });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, state };
}

describe("MCP server (in memory)", () => {
  it("lists the four tools", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["council_history", "council_members", "council_override", "council_plan"]);
  });

  it("council_plan returns the verdict, dissent and the clerk's plan, and records the decision", async () => {
    const { client, state } = await connect();
    const out = textOf(await client.callTool({ name: "council_plan", arguments: { prompt: "Build X", context: "solo, 2 days" } }));
    assert.match(out, /Council decision decision-001/);
    assert.match(out, /FINAL PLAN from the clerk/);
    assert.equal(state.history.length, 1);
  });

  it("council_plan rejects an empty prompt", async () => {
    const { client } = await connect();
    const result = (await client.callTool({ name: "council_plan", arguments: { prompt: "" } })) as Text;
    assert.ok(result.isError);
  });

  it("council_override credits matching members once, and validates the option", async () => {
    const { client, state } = await connect({ round2: () => ({ target: "RAZOR", vote: "BISHOP", confidence: 0.8 }) });
    await client.callTool({ name: "council_plan", arguments: { prompt: "p" } });

    const bad = (await client.callTool({ name: "council_override", arguments: { decision_id: "decision-001", correct_option: "nobody" } })) as Text;
    assert.ok(bad.isError);
    assert.match(textOf(bad), /not an option/);

    const ok = (await client.callTool({ name: "council_override", arguments: { decision_id: "decision-001", correct_option: "bishop" } })) as Text;
    assert.ok(!ok.isError);
    assert.equal(state.history[0]!.overriddenTo, "BISHOP");
    assert.equal(state.members.every((m) => m.stats.overrideMatches === 1), true);

    const again = (await client.callTool({ name: "council_override", arguments: { decision_id: "decision-001", correct_option: "naive" } })) as Text;
    assert.ok(again.isError);
    assert.equal(state.members.every((m) => m.stats.overrideMatches === 1), true);
  });

  it("council_override on an unknown decision is an error", async () => {
    const { client } = await connect();
    const r = (await client.callTool({ name: "council_override", arguments: { decision_id: "decision-099", correct_option: "naive" } })) as Text;
    assert.ok(r.isError);
  });

  it("council_members and council_history reflect state", async () => {
    const { client } = await connect();
    assert.match(textOf(await client.callTool({ name: "council_history", arguments: {} })), /No decisions yet/);
    await client.callTool({ name: "council_plan", arguments: { prompt: "p" } });
    assert.match(textOf(await client.callTool({ name: "council_history", arguments: {} })), /decision-001/);
    const roster = textOf(await client.callTool({ name: "council_members", arguments: {} }));
    for (const m of DEFAULT_MEMBERS) assert.match(roster, new RegExp(`${m.name}-v1`));
  });

  it("serialises concurrent deliberations so ids and records never collide", async () => {
    const { client, state } = await connect();
    await Promise.all([1, 2, 3].map((n) => client.callTool({ name: "council_plan", arguments: { prompt: `p${n}` } })));
    assert.deepEqual(state.history.map((d) => d.id), ["decision-001", "decision-002", "decision-003"]);
  });

  it("sends progress notifications when the client asks for them", async () => {
    const { client } = await connect();
    const seen: string[] = [];
    await client.callTool(
      { name: "council_plan", arguments: { prompt: "p" } },
      undefined,
      { onprogress: (p) => void seen.push(String(p.message)) }
    );
    assert.ok(seen.includes("naive_plan") && seen.includes("synthesis"), `got ${seen.join(",")}`);
  });
});

describe("MCP server (real stdio process)", () => {
  it("speaks clean JSON-RPC on stdout and survives a failing model call", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", fileURLToPath(new URL("../src/index.ts", import.meta.url))],
      // A fake key: the model call will fail, which must come back as a tool error, not a crash.
      env: { ...(process.env as Record<string, string>), ANTHROPIC_API_KEY: "sk-ant-test-fake", COUNCIL_STATE_DIR: "none" },
      stderr: "ignore",
    });
    const client = new Client({ name: "test", version: "0" });
    await client.connect(transport);
    try {
      assert.equal((await client.listTools()).tools.length, 4);
      assert.match(textOf(await client.callTool({ name: "council_members", arguments: {} })), /RAZOR-v1/);

      const failed = (await client.callTool({ name: "council_plan", arguments: { prompt: "p" } })) as Text;
      assert.ok(failed.isError);
      assert.match(textOf(failed), /Council deliberation failed/);
      // Still alive afterwards.
      assert.equal((await client.listTools()).tools.length, 4);
    } finally {
      await client.close();
    }
  });
});
