import type { Llm } from "./llm.js";
import { round1Prompt, round2Prompt } from "./members.js";
import { runReaper } from "./reaper.js";
import {
  round1Schema,
  round2Schema,
  type Challenge,
  type DecisionRecord,
  type MemberDefinition,
  type MemberState,
  type Position,
  type Verdict,
} from "./schemas.js";
import type { CouncilState } from "./state.js";

export interface CouncilRequest {
  prompt: string;
  /** Anything the council should know that the prompt does not say. */
  context?: string;
}

export interface CouncilOptions {
  /** The pool the reaper draws replacement archetypes from. */
  pool: MemberDefinition[];
  /** Run the reaper every N decisions; 0 turns it off. */
  reapEvery: number;
}

/**
 * Plan, then challenge:
 *
 *   naive plan -> round 1 (members work in isolation, in parallel)
 *              -> round 2 (only if anyone wants a change: they read each other and vote)
 *              -> verdict (weighted votes) -> synthesis -> record
 *
 * Isolation is structural, not a prompt trick: in round 1 no call contains any
 * other member's output. A model that sees another's reasoning tends to answer
 * "I agree because...", which is the failure the council exists to prevent.
 */
export async function deliberate(
  state: CouncilState,
  llm: Llm,
  request: CouncilRequest,
  options: CouncilOptions
): Promise<DecisionRecord> {
  const id = state.nextId();
  const context = request.context?.trim() ?? "";
  const members = [...state.members]; // stable for this decision, even if the reaper runs later

  state.emit({ type: "phase", phase: "naive_plan" });
  const naivePlan = await llm.text({
    prompt: `Write a straightforward implementation plan. Concise numbered steps, no sub-tasks. This is a first draft that others will challenge.\n\n${context ? `Context:\n${context}\n\n` : ""}Project: ${request.prompt}`,
    maxTokens: 8000,
  });

  state.emit({ type: "phase", phase: "round_1" });
  const positions = await Promise.all(
    members.map(async (member): Promise<Position> => {
      const reply = await llm.object({
        prompt: round1Prompt(member, request.prompt, context, naivePlan),
        schema: round1Schema,
      });
      const name = member.definition.name;
      // "revised" means "my own plan"; store the member's name so every vote is one option.
      const vote = reply.vote === "revised" ? name : "naive";
      state.emit({ type: "position", member: name, vote });
      return {
        member: name,
        frameworkAnswers: reply.framework_answers,
        critique: reply.critique,
        revisedPlan: reply.revised_plan,
        vote,
        confidence: reply.confidence,
      };
    })
  );

  // Skip the debate only if nobody wants any change. If everyone backs their own
  // plan, the plans differ, so that is the case that most needs a debate.
  const contested = positions.some((p) => p.vote !== "naive");
  let challenges: Challenge[] = [];
  if (contested) {
    state.emit({ type: "phase", phase: "round_2" });
    challenges = await runRound2(state, llm, members, request.prompt, positions);
  }

  state.emit({ type: "phase", phase: "verdict" });
  const verdict = computeVerdict(members, positions, challenges);
  state.emit({ type: "verdict", winner: verdict.winner, confidence: verdict.confidence });
  updateStats(members, positions, challenges, verdict);

  state.emit({ type: "phase", phase: "synthesis" });
  const finalPlan = await synthesize(llm, request.prompt, context, naivePlan, positions, challenges, verdict);

  const record: DecisionRecord = {
    id,
    timestamp: Date.now(),
    prompt: request.prompt,
    naivePlan,
    positions,
    challenges,
    verdict,
    finalPlan,
  };
  state.record(record);

  if (options.reapEvery > 0 && state.counter % options.reapEvery === 0) {
    state.emit({ type: "phase", phase: "reaper" });
    if (runReaper(state, options.pool)) state.save();
  }
  return record;
}

async function runRound2(
  state: CouncilState,
  llm: Llm,
  members: MemberState[],
  prompt: string,
  positions: Position[]
): Promise<Challenge[]> {
  const names = members.map((m) => m.definition.name) as [string, ...string[]];
  const schema = round2Schema(names);

  return Promise.all(
    members.map(async (member): Promise<Challenge> => {
      const name = member.definition.name;
      const own = positions.find((p) => p.member === name)!;
      const reply = await llm.object({
        prompt: round2Prompt(member, prompt, positions, { vote: own.vote, confidence: own.confidence }),
        schema,
      });
      // Defection is a fact about the two votes, so compute it; do not ask the model to self-report.
      const defected = reply.final_vote !== own.vote;
      state.emit({ type: "vote", member: name, vote: reply.final_vote, defected });
      return {
        member: name,
        target: reply.challenge_target,
        challenge: reply.challenge,
        previousVote: own.vote,
        finalVote: reply.final_vote,
        defected,
        confidence: reply.confidence,
      };
    })
  );
}

/** Each member's last word: their round 2 vote if there was one, else round 1. */
export function finalVotes(positions: Position[], challenges: Challenge[]) {
  return challenges.length > 0
    ? challenges.map((c) => ({ member: c.member, vote: c.finalVote, confidence: c.confidence }))
    : positions.map((p) => ({ member: p.member, vote: p.vote, confidence: p.confidence }));
}

/**
 * Each vote counts for (confidence x a blend of the member's track record).
 * A new member has no record and gets a neutral 0.5, so the weight stays in
 * [0.5 x confidence, confidence]: a record can discount a member, never silence one.
 */
export function computeVerdict(members: MemberState[], positions: Position[], challenges: Challenge[]): Verdict {
  const votes = finalVotes(positions, challenges).map((v) => {
    const stats = members.find((m) => m.definition.name === v.member)?.stats;
    const record = stats && stats.totalDecisions > 0 ? (stats.wins + stats.overrideMatches) / stats.totalDecisions : 0.5;
    return { ...v, weight: v.confidence * (0.5 + 0.5 * Math.min(1, record)) };
  });

  const totals = new Map<string, number>();
  for (const v of votes) totals.set(v.vote, (totals.get(v.vote) ?? 0) + v.weight);
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const winner = ranked[0]?.[0] ?? "naive";
  const total = [...totals.values()].reduce((a, b) => a + b, 0);

  const dissent = votes
    .filter((v) => v.vote !== winner)
    .map((v) => `${v.member}: ${positions.find((p) => p.member === v.member)?.critique.slice(0, 200) ?? "Dissented without detail."}`);

  return { winner, confidence: total > 0 ? (totals.get(winner) ?? 0) / total : 0, votes, dissent };
}

function updateStats(members: MemberState[], positions: Position[], challenges: Challenge[], verdict: Verdict) {
  for (const { member, vote } of finalVotes(positions, challenges)) {
    const stats = members.find((m) => m.definition.name === member)?.stats;
    if (!stats) continue;
    stats.totalDecisions += 1;
    if (vote === verdict.winner) stats.wins += 1;
    else stats.losses += 1;
  }
  for (const c of challenges) {
    if (c.defected) members.find((m) => m.definition.name === c.member)!.stats.defections += 1;
  }
}

/** The Clerk: no personality, no vote. Turns the deliberation into a plan someone can follow. */
async function synthesize(
  llm: Llm,
  prompt: string,
  context: string,
  naivePlan: string,
  positions: Position[],
  challenges: Challenge[],
  verdict: Verdict
) {
  const positionsBlock = positions
    .map(
      (p) =>
        `--- ${p.member} (voted ${p.vote}, confidence ${p.confidence}) ---\n${p.frameworkAnswers
          .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
          .join("\n")}\nCritique: ${p.critique}\nRevised plan: ${p.revisedPlan}`
    )
    .join("\n\n");
  const challengesBlock = challenges.length
    ? challenges
        .map((c) => `${c.member} -> ${c.target}: ${c.challenge}\n  final vote: ${c.finalVote} (${c.defected ? "DEFECTED" : "held"}, confidence ${c.confidence})`)
        .join("\n\n")
    : "No debate: every member voted to keep the naive plan.";

  return llm.text({
    maxTokens: 16000,
    prompt: `You are the Clerk, a neutral synthesizer with no personality and no vote. Compile the council's deliberation into one plan that someone can follow step by step.

ORIGINAL PROMPT
${prompt}
${context ? `\nCONTEXT\n${context}\n` : ""}
NAIVE PLAN (baseline)
${naivePlan}

ROUND 1 POSITIONS
${positionsBlock}

ROUND 2 CHALLENGES
${challengesBlock}

VERDICT
Winner: ${verdict.winner} (confidence ${verdict.confidence.toFixed(2)})
Votes: ${verdict.votes.map((v) => `${v.member}=${v.vote}`).join(", ")}

Write the plan in this format:
1. An executive summary paragraph.
2. A table of technology decisions: decision | choice | whose reasoning.
3. Numbered phases, each with its deliverable, files to create, dependencies on earlier phases, and acceptance criteria.
4. Risk mitigations inline, where a member raised a concern.
5. Dissent notes: where members disagreed, give both positions so the implementer can make an informed call.
6. A definition-of-done checklist.

Be specific: real file paths, library names and commands. Do not invent facts the members did not raise.`,
  });
}
