#!/usr/bin/env node
// stdout belongs to the MCP protocol. Send any stray console.log to stderr
// before anything else loads, so a library's debug print cannot corrupt it.
console.log = (...args: unknown[]) => console.error(...args);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { deliberate } from "./council.js";
import { claudeLlm, type Llm } from "./llm.js";
import { log } from "./log.js";
import { loadMemberDefinitions } from "./members.js";
import { memberScore } from "./reaper.js";
import { CouncilState } from "./state.js";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export function createCouncilServer(deps: { llm: Llm; state: CouncilState; pool: ReturnType<typeof loadMemberDefinitions>; reapEvery: number }) {
  const { llm, state, pool, reapEvery } = deps;
  const server = new McpServer({ name: "council", version: "0.1.0" });

  // One deliberation at a time: they all read and write the same roster and history.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>) => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  server.registerTool(
    "council_plan",
    {
      title: "Council plan",
      description:
        "Submit a project or decision for the council to deliberate. A naive plan is drafted, then several members with different engineering outlooks critique it in isolation, debate if they disagree, and vote. Returns a synthesized plan with the verdict and any dissent. Takes a few minutes: use it for decisions that are costly to get wrong, not for routine steps.",
      inputSchema: {
        prompt: z.string().min(1).describe("The project or decision to plan"),
        context: z.string().optional().describe("Anything the council should know that the prompt does not say"),
      },
    },
    async ({ prompt, context }, extra) => {
      // Progress notifications tell the client we are alive, which keeps many clients from timing out.
      const token = extra._meta?.progressToken;
      let step = 0;
      const stop = state.onEvent((event) => {
        if (token === undefined || event.type !== "phase") return;
        step += 1;
        void extra.sendNotification({
          method: "notifications/progress",
          params: { progressToken: token, progress: step, total: 7, message: event.phase },
        });
      });
      try {
        const d = await serial(() => deliberate(state, llm, { prompt, context }, { pool, reapEvery }));
        const votes = d.verdict.votes
          .map((v) => `- **${v.member}**: ${v.vote} (confidence ${(v.confidence * 100).toFixed(0)}%, weight ${v.weight.toFixed(2)})`)
          .join("\n");
        const dissent = d.verdict.dissent.length ? `**Dissent**\n${d.verdict.dissent.map((x) => `- ${x}`).join("\n")}` : "*No dissent.*";
        return {
          content: [
            {
              type: "text" as const,
              text: `# Council decision ${d.id}

**Winner:** ${d.verdict.winner} (${(d.verdict.confidence * 100).toFixed(0)}% of the vote weight)

${votes}

${dissent}

---

## Plan

${d.finalPlan}

---

If the plan hits a decision it does not cover, call \`council_plan\` again with that specific decision. If you disagree with the verdict, call \`council_override\` with ${d.id} so the members' records learn from it.`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log("Deliberation failed:", message);
        return { content: [{ type: "text" as const, text: `Council deliberation failed: ${message}` }], isError: true };
      } finally {
        stop();
      }
    }
  );

  server.registerTool(
    "council_members",
    { title: "Council roster", description: "Show the council: each member's archetype, record, and lineage.", inputSchema: {} },
    async () => {
      const rows = state.members.map((m) => {
        const s = m.stats;
        const rate = s.totalDecisions ? `${((s.wins / s.totalDecisions) * 100).toFixed(0)}%` : "n/a";
        return `**${m.definition.name}-v${m.generation}** (${m.definition.archetype})
  Record: ${s.wins}W-${s.losses}L (${rate}) | defections: ${s.defections} | override matches: ${s.overrideMatches} | score: ${memberScore(s).toFixed(2)}
  Lineage: ${m.lineage.join(" -> ")}`;
      });
      return { content: [{ type: "text" as const, text: `# Council roster\n\n${rows.join("\n\n")}\n\n*Decisions so far: ${state.counter}*` }] };
    }
  );

  server.registerTool(
    "council_history",
    {
      title: "Council history",
      description: "Show recent decisions with their verdicts and vote breakdowns.",
      inputSchema: { limit: z.number().int().min(1).max(50).optional().describe("How many recent decisions (default 5)") },
    },
    async ({ limit }) => {
      const recent = state.history.slice(-(limit ?? 5));
      if (!recent.length) return { content: [{ type: "text" as const, text: "No decisions yet." }] };
      const text = recent
        .map(
          (d) => `### ${d.id} (${new Date(d.timestamp).toISOString()})
**Prompt:** ${d.prompt.slice(0, 120)}${d.prompt.length > 120 ? "..." : ""}
**Verdict:** ${d.verdict.winner} (${(d.verdict.confidence * 100).toFixed(0)}%)
**Votes:** ${d.verdict.votes.map((v) => `${v.member}=${v.vote}`).join(", ")}
**Overridden:** ${d.overriddenTo ? `yes, to ${d.overriddenTo}` : "no"}`
        )
        .join("\n\n");
      return { content: [{ type: "text" as const, text: `# Decision history\n\n${text}` }] };
    }
  );

  server.registerTool(
    "council_override",
    {
      title: "Override a verdict",
      description:
        "Tell the council a past verdict was wrong. Members whose final vote matched the option you name get credit, which shifts future vote weights and who the reaper replaces.",
      inputSchema: {
        decision_id: z.string().describe("e.g. decision-001"),
        correct_option: z.string().describe("'naive', or the name of the member whose plan should have won"),
      },
    },
    async ({ decision_id, correct_option }) => {
      const record = state.history.find((d) => d.id === decision_id);
      if (!record) return { content: [{ type: "text" as const, text: `Decision ${decision_id} not found.` }], isError: true };

      const options = new Set(["naive", ...record.positions.map((p) => p.member)]);
      const wanted = [...options].find((o) => o.toLowerCase() === correct_option.toLowerCase());
      if (!wanted) {
        return { content: [{ type: "text" as const, text: `"${correct_option}" was not an option. Choose one of: ${[...options].join(", ")}.` }], isError: true };
      }
      if (record.overriddenTo) {
        return { content: [{ type: "text" as const, text: `${decision_id} was already overridden to ${record.overriddenTo}.` }], isError: true };
      }

      record.overriddenTo = wanted;
      const last = record.challenges.length ? record.challenges.map((c) => ({ member: c.member, vote: c.finalVote })) : record.positions.map((p) => ({ member: p.member, vote: p.vote }));
      for (const v of last) {
        if (v.vote === wanted) state.members.find((m) => m.definition.name === v.member)!.stats.overrideMatches += 1;
      }
      state.save();
      return { content: [{ type: "text" as const, text: `Override recorded for ${decision_id}: "${wanted}" should have won. Member records updated.` }] };
    }
  );

  return server;
}

async function main() {
  const effort = (process.env.COUNCIL_EFFORT ?? "medium") as (typeof EFFORTS)[number];
  if (!EFFORTS.includes(effort)) throw new Error(`COUNCIL_EFFORT must be one of ${EFFORTS.join(", ")}.`);

  const pool = loadMemberDefinitions(process.env.COUNCIL_MEMBERS_FILE);
  const stateDir = process.env.COUNCIL_STATE_DIR ?? ".council";
  const state = new CouncilState(pool, stateDir === "none" ? null : stateDir);
  const llm = claudeLlm({ model: process.env.COUNCIL_MODEL ?? "claude-opus-5-5", effort });
  const reapEvery = Number(process.env.COUNCIL_REAP_EVERY ?? 5);

  const server = createCouncilServer({ llm, state, pool, reapEvery });
  await server.connect(new StdioServerTransport());
  log(`running on stdio with ${state.members.length} members, ${state.history.length} past decisions`);
}

// Run only when started directly, so tests can import createCouncilServer.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
// realpath on argv[1]: a bin symlink (npx, pnpm) otherwise never equals the real module path.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((error) => {
    log("Fatal:", error);
    process.exit(1);
  });
}
