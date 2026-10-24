import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { computeVerdict, deliberate } from "../src/council.js";
import { DEFAULT_MEMBERS, freshMember, loadMemberDefinitions } from "../src/members.js";
import { memberScore, runReaper } from "../src/reaper.js";
import { CouncilState } from "../src/state.js";
import { stubLlm } from "./stub-llm.js";

const options = { pool: DEFAULT_MEMBERS, reapEvery: 0 };
const NAMES = DEFAULT_MEMBERS.map((m) => m.name);
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "council-"));
  dirs.push(d);
  return d;
};
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("deliberate", () => {
  it("keeps round 1 isolated: no member's prompt contains another member's output", async () => {
    const state = new CouncilState(DEFAULT_MEMBERS, null);
    const { llm, prompts } = stubLlm();
    await deliberate(state, llm, { prompt: "build X" }, options);

    const round1 = prompts.filter((p) => p.kind === "round1");
    assert.equal(round1.length, NAMES.length);
    for (const call of round1) {
      for (const other of NAMES.filter((n) => n !== call.member)) {
        assert.ok(!call.prompt.includes(`${other}-CRITIQUE`) && !call.prompt.includes(`${other}-PLAN`), `${call.member} saw ${other}`);
      }
    }
  });

  it("round 2 does show every member's round 1 position", async () => {
    const state = new CouncilState(DEFAULT_MEMBERS, null);
    const { llm, prompts } = stubLlm();
    await deliberate(state, llm, { prompt: "build X" }, options);
    const round2 = prompts.filter((p) => p.kind === "round2");
    assert.equal(round2.length, NAMES.length);
    for (const call of round2) for (const n of NAMES) assert.ok(call.prompt.includes(`${n}-CRITIQUE`));
  });

  it("skips the debate only when every member votes to keep the naive plan", async () => {
    const state = new CouncilState(DEFAULT_MEMBERS, null);
    const { llm, prompts } = stubLlm({ round1: () => ({ vote: "naive", confidence: 0.9 }) });
    const d = await deliberate(state, llm, { prompt: "p" }, options);
    assert.equal(prompts.filter((p) => p.kind === "round2").length, 0);
    assert.equal(d.verdict.winner, "naive");
    assert.deepEqual(d.challenges, []);
  });

  it("debates when everyone backs their own plan (the plans differ)", async () => {
    const state = new CouncilState(DEFAULT_MEMBERS, null);
    const { llm, prompts } = stubLlm(); // default: every member votes "revised"
    await deliberate(state, llm, { prompt: "p" }, options);
    assert.equal(prompts.filter((p) => p.kind === "round2").length, NAMES.length);
  });

  it("computes defection from the votes, not from the model", async () => {
    const state = new CouncilState(DEFAULT_MEMBERS, null);
    const { llm } = stubLlm({ round2: (member, own) => ({ target: "RAZOR", vote: member === "GHOST" ? "BISHOP" : own, confidence: 0.7 }) });
    const d = await deliberate(state, llm, { prompt: "p" }, options);
    const ghost = d.challenges.find((c) => c.member === "GHOST")!;
    assert.equal(ghost.defected, true);
    assert.equal(ghost.previousVote, "GHOST");
    assert.equal(ghost.finalVote, "BISHOP");
    assert.equal(d.challenges.filter((c) => c.defected).length, 1);
    assert.equal(state.members.find((m) => m.definition.name === "GHOST")!.stats.defections, 1);
  });

  it("records wins and losses against the winning option, and saves the decision", async () => {
    const state = new CouncilState(DEFAULT_MEMBERS, null);
    // Everyone converges on BISHOP's plan in round 2.
    const { llm } = stubLlm({ round2: () => ({ target: "RAZOR", vote: "BISHOP", confidence: 0.8 }) });
    const d = await deliberate(state, llm, { prompt: "p" }, options);
    assert.equal(d.verdict.winner, "BISHOP");
    assert.equal(d.finalPlan, "FINAL PLAN from the clerk");
    assert.equal(state.history.length, 1);
    for (const m of state.members) assert.equal(m.stats.wins, 1);
    assert.deepEqual(d.verdict.dissent, []);
  });
});

describe("computeVerdict", () => {
  const members = DEFAULT_MEMBERS.map(freshMember);
  const pos = (member: string, vote: string, confidence: number) => ({
    member,
    frameworkAnswers: [],
    critique: `${member} critique`,
    revisedPlan: "",
    vote,
    confidence,
  });

  it("weights votes by confidence and a neutral 0.5 record for new members", () => {
    const v = computeVerdict(members, [pos("RAZOR", "naive", 1), pos("GHOST", "GHOST", 0.5)], []);
    assert.equal(v.winner, "naive");
    assert.equal(v.votes[0]!.weight, 0.75); // 1 x (0.5 + 0.5 x 0.5)
    assert.equal(v.votes[1]!.weight, 0.375);
    assert.ok(Math.abs(v.confidence - 0.75 / 1.125) < 1e-9);
    assert.equal(v.dissent.length, 1);
  });

  it("lets a strong track record outweigh a slightly more confident newcomer", () => {
    const veteran = freshMember(DEFAULT_MEMBERS[0]!);
    veteran.stats = { wins: 9, losses: 1, defections: 0, totalDecisions: 10, overrideMatches: 0 };
    const rookie = freshMember(DEFAULT_MEMBERS[1]!);
    const v = computeVerdict([veteran, rookie], [pos("RAZOR", "A", 0.8), pos("GHOST", "B", 0.9)], []);
    assert.equal(v.winner, "A"); // 0.8 x 0.95 = 0.76  vs  0.9 x 0.75 = 0.675
  });

  it("a bad record discounts a member but cannot silence them", () => {
    const loser = freshMember(DEFAULT_MEMBERS[0]!);
    loser.stats = { wins: 0, losses: 10, defections: 0, totalDecisions: 10, overrideMatches: 0 };
    const v = computeVerdict([loser], [pos("RAZOR", "x", 1)], []);
    assert.equal(v.votes[0]!.weight, 0.5);
  });
});

describe("reaper", () => {
  it("replaces the worst member, keeping the seat and the name, and bumps the generation", () => {
    const state = new CouncilState(DEFAULT_MEMBERS, null);
    state.members[1]!.stats = { wins: 0, losses: 10, defections: 2, totalDecisions: 10, overrideMatches: 0 };
    state.members[2]!.stats = { wins: 9, losses: 1, defections: 0, totalDecisions: 10, overrideMatches: 0 };
    const events: string[] = [];
    state.onEvent((e) => e.type === "reaper" && events.push(e.replacement));

    const replacement = runReaper(state, DEFAULT_MEMBERS)!;
    assert.equal(replacement.definition.name, "GHOST");
    assert.equal(replacement.generation, 2);
    assert.equal(state.members[1], replacement);
    assert.match(replacement.definition.systemPrompt, /INHERITED TRAIT from SCOUT/);
    assert.equal(memberScore(replacement.stats), 0.5);
    assert.deepEqual(events, ["GHOST-v2"]);
  });

  it("does nothing when everyone is above the threshold", () => {
    const state = new CouncilState(DEFAULT_MEMBERS, null);
    assert.equal(runReaper(state, DEFAULT_MEMBERS), null);
  });

  it("runs on schedule from deliberate()", async () => {
    const state = new CouncilState(DEFAULT_MEMBERS, null);
    state.members[0]!.stats = { wins: 0, losses: 20, defections: 0, totalDecisions: 20, overrideMatches: 0 };
    state.counter = 4; // the next decision is the 5th
    state.members[3]!.stats = { wins: 20, losses: 0, defections: 0, totalDecisions: 20, overrideMatches: 0 };
    const { llm } = stubLlm({ round2: () => ({ target: "GHOST", vote: "naive", confidence: 0.5 }) });
    await deliberate(state, llm, { prompt: "p" }, { pool: DEFAULT_MEMBERS, reapEvery: 5 });
    assert.equal(state.members[0]!.generation, 2);
  });
});

describe("state", () => {
  it("survives a restart: roster, records, history and the id counter", async () => {
    const dir = tmp();
    const first = new CouncilState(DEFAULT_MEMBERS, dir);
    await deliberate(first, stubLlm().llm, { prompt: "p" }, options);

    const second = new CouncilState(DEFAULT_MEMBERS, dir);
    assert.equal(second.history.length, 1);
    assert.equal(second.counter, 1);
    assert.equal(second.members[0]!.stats.totalDecisions, 1);
    assert.equal(second.nextId(), "decision-002");
  });

  it("drops saved members that are no longer on the roster", async () => {
    const dir = tmp();
    const first = new CouncilState(DEFAULT_MEMBERS, dir);
    first.members[0]!.stats.wins = 7;
    first.save();

    const trimmed = DEFAULT_MEMBERS.slice(1); // RAZOR removed
    const second = new CouncilState(trimmed, dir);
    assert.deepEqual(second.members.map((m) => m.definition.name), ["GHOST", "SCOUT", "BISHOP"]);
  });

  it("starts fresh instead of crashing on a corrupt state file", () => {
    const dir = tmp();
    writeFileSync(join(dir, "state.json"), "{not json");
    const state = new CouncilState(DEFAULT_MEMBERS, dir);
    assert.equal(state.history.length, 0);
    assert.equal(state.members.length, 4);
  });
});

describe("loadMemberDefinitions", () => {
  const write = (value: unknown) => {
    const file = join(tmp(), "members.json");
    writeFileSync(file, JSON.stringify(value));
    return file;
  };
  const member = (name: string) => ({ name, archetype: "a", systemPrompt: "You are " + name, frameworkQuestions: ["q?"] });

  it("loads the example roster that ships in examples/", () => {
    const file = fileURLToPath(new URL("../examples/members.json", import.meta.url));
    assert.deepEqual(loadMemberDefinitions(file).map((m) => m.name), ["OPS", "USER", "LAWYER"]);
  });
  it("returns the defaults with no file", () => assert.equal(loadMemberDefinitions(undefined), DEFAULT_MEMBERS));
  it("loads a custom roster", () => assert.deepEqual(loadMemberDefinitions(write([member("ONE"), member("TWO")])).map((m) => m.name), ["ONE", "TWO"]));
  it("rejects duplicate names", () => assert.throws(() => loadMemberDefinitions(write([member("ONE"), member("one")])), /unique/));
  it("rejects the reserved name 'naive'", () => assert.throws(() => loadMemberDefinitions(write([member("NAIVE"), member("TWO")])), /reserved/));
  it("rejects a council of one", () => assert.throws(() => loadMemberDefinitions(write([member("ONE")]))));
});
