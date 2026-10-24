import { readFileSync } from "node:fs";
import { z } from "zod";
import type { MemberDefinition, MemberState } from "./schemas.js";

// What every member is told, whatever their personality. The rules that keep a
// council honest live here, not in the individual prompts.
const GROUND_RULES = `You MUST answer your framework questions BEFORE forming any position. Your position MUST be grounded in your answers. Do not skip or rush the framework: it IS your reasoning process.

If you change your mind in a challenge round, you must cite SPECIFIC new evidence from another member's position. "I agree with X" is NOT sufficient reason to change your vote.`;

export const DEFAULT_MEMBERS: MemberDefinition[] = [
  {
    name: "RAZOR",
    archetype: "shipper",
    systemPrompt: `You are RAZOR, the Shipper. You believe shipping beats perfection. Overengineering is the real risk, not underengineering. You are impatient with theoretical concerns that do not block a working v1.\n\n${GROUND_RULES}`,
    frameworkQuestions: [
      "What is the fastest path to a working implementation?",
      "Which steps in this plan hide complexity behind vague language?",
      "What can be deferred to v2 without blocking a working v1?",
      "What is the realistic effort estimate for each major step?",
    ],
  },
  {
    name: "GHOST",
    archetype: "paranoid",
    systemPrompt: `You are GHOST, the Paranoid. You believe every plan is optimistic until proven otherwise. The unhandled edge case is always the one that ships to production. You are suspicious of confident estimates and clean-looking architectures.\n\n${GROUND_RULES}`,
    frameworkQuestions: [
      "What fails at 10x the expected load or usage?",
      "What is the rollback plan if each major step goes wrong?",
      "What external dependencies could break, and what happens when they do?",
      "What error cases and edge conditions does this plan not address?",
    ],
  },
  {
    name: "SCOUT",
    archetype: "researcher",
    systemPrompt: `You are SCOUT, the Researcher. You believe most problems have been solved before. Building from scratch is usually wrong. You bring prior art that challenges assumptions. Say plainly when you are recalling from memory rather than from a source you were given.\n\n${GROUND_RULES}`,
    frameworkQuestions: [
      "What existing tools, libraries, or patterns already solve parts of this?",
      "What do benchmarks, comparisons, or community consensus say about the choices made?",
      "What is the adoption trajectory of the technologies mentioned in the plan?",
      "What prior art or existing solutions is this plan ignoring?",
    ],
  },
  {
    name: "BISHOP",
    archetype: "architect",
    systemPrompt: `You are BISHOP, the Architect. You believe structure determines outcomes. A well-layered system with correct dependencies matters more than shipping speed. You think in systems, not tasks.\n\n${GROUND_RULES}`,
    frameworkQuestions: [
      "What does the dependency graph look like after this plan executes?",
      "Does this plan create tight coupling that will be painful to change later?",
      "What is the correct ordering of steps given their true dependencies?",
      "What architectural layers should this plan define, and does it define them?",
    ],
  },
];

const memberFileSchema = z
  .array(
    z.object({
      name: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,23}$/, "letters, digits, - or _; max 24 chars"),
      archetype: z.string().min(1),
      systemPrompt: z.string().min(1),
      frameworkQuestions: z.array(z.string().min(1)).min(1).max(8),
    })
  )
  .min(2)
  .max(8);

/** Replace the default roster with your own. Names must be unique (they are the vote options). */
export function loadMemberDefinitions(file: string | undefined): MemberDefinition[] {
  if (!file) return DEFAULT_MEMBERS;
  const definitions = memberFileSchema.parse(JSON.parse(readFileSync(file, "utf-8")));
  const names = definitions.map((d) => d.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new Error(`${file}: member names must be unique.`);
  if (names.includes("naive")) throw new Error(`${file}: "naive" is reserved for the baseline plan.`);
  return definitions;
}

export function freshMember(definition: MemberDefinition): MemberState {
  return {
    definition,
    generation: 1,
    lineage: [`${definition.name}-v1`],
    stats: { wins: 0, losses: 0, defections: 0, totalDecisions: 0, overrideMatches: 0 },
  };
}

// ---- prompts

export function round1Prompt(member: MemberState, prompt: string, context: string, naivePlan: string) {
  const { definition } = member;
  return `${definition.systemPrompt}

THE DECISION
User prompt: "${prompt}"
${context ? `\nCONTEXT\n${context}\n` : ""}
NAIVE PLAN (single-agent baseline)
${naivePlan}

YOUR TASK
1. Answer each framework question, in order:
${definition.frameworkQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}
2. Critique the naive plan from your perspective (2 to 3 paragraphs).
3. Write your full revised plan.
4. Vote "naive" to keep the baseline as is, or "revised" to back your own plan.
5. Give your confidence from 0 to 1.`;
}

export function round2Prompt(
  member: MemberState,
  prompt: string,
  positions: { member: string; critique: string; revisedPlan: string; vote: string; confidence: number }[],
  own: { vote: string; confidence: number }
) {
  const shown = positions
    .map(
      (p) =>
        `--- ${p.member} (voted: ${p.vote}, confidence: ${p.confidence}) ---\nCritique: ${p.critique}\nRevised plan: ${p.revisedPlan}`
    )
    .join("\n\n");
  return `${member.definition.systemPrompt}

THE DECISION
"${prompt}"

ALL ROUND 1 POSITIONS (revealed together, after everyone committed)
${shown}

YOUR ROUND 1 POSITION
You voted: ${own.vote} (confidence: ${own.confidence})

YOUR TASK
1. Challenge ONE other member. Quote or cite specific claims from their position.
2. Cast your final vote: "naive", or the name of the member whose revised plan should win (you may vote for yourself).
   Changing your vote is logged as a defection and costs reputation. Only change it for specific new evidence.
3. Give your final confidence from 0 to 1.`;
}

// ---- evolution

/** A replacement for an executed member: a random archetype, plus one question borrowed from the best member. */
export function spawnReplacement(dead: MemberState, best: MemberState, pool: MemberDefinition[]): MemberState {
  const base = pool[Math.floor(Math.random() * pool.length)]!;
  const borrowed = best.definition.frameworkQuestions[Math.floor(Math.random() * best.definition.frameworkQuestions.length)]!;
  const generation = dead.generation + 1;
  return {
    definition: {
      name: dead.definition.name,
      archetype: base.archetype,
      systemPrompt: `${base.systemPrompt}\n\nINHERITED TRAIT from ${best.definition.name}: you also consider this question:\n"${borrowed}"\nIt was inherited because ${best.definition.name} has the best track record on the council.`,
      frameworkQuestions: [...base.frameworkQuestions.slice(0, base.frameworkQuestions.length - 1), borrowed],
    },
    generation,
    lineage: [...dead.lineage, `${dead.definition.name}-v${generation} (${base.archetype} + ${best.definition.name} trait)`],
    stats: { wins: 0, losses: 0, defections: 0, totalDecisions: 0, overrideMatches: 0 },
  };
}
