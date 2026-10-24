import { z } from "zod";

/** The shape of every structured reply a member gives. Validated by the API, not by regex. */

export const round1Schema = z.object({
  framework_answers: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .describe("One answer per framework question, in order."),
  critique: z.string().describe("Critique of the naive plan from your perspective."),
  revised_plan: z.string().describe("Your full revised plan."),
  vote: z.enum(["naive", "revised"]).describe("Keep the naive plan, or back your own revised plan."),
  confidence: z.number().min(0).max(1),
});
export type Round1Reply = z.infer<typeof round1Schema>;

/** Round 2 votes name a member, so the schema is built from the live roster. */
export function round2Schema(memberNames: [string, ...string[]]) {
  return z.object({
    challenge_target: z.enum(memberNames).describe("The member whose position you challenge."),
    challenge: z.string().describe("A specific challenge that quotes their claims."),
    final_vote: z
      .enum(["naive", ...memberNames])
      .describe("'naive', or the name of the member whose revised plan should win."),
    confidence: z.number().min(0).max(1),
  });
}
export type Round2Reply = { challenge_target: string; challenge: string; final_vote: string; confidence: number };

// ---- records

export interface MemberStats {
  wins: number;
  losses: number;
  defections: number;
  totalDecisions: number;
  overrideMatches: number;
}

export interface MemberDefinition {
  name: string;
  archetype: string;
  systemPrompt: string;
  frameworkQuestions: string[];
}

export interface MemberState {
  definition: MemberDefinition;
  generation: number;
  lineage: string[];
  stats: MemberStats;
}

export interface Position {
  member: string;
  frameworkAnswers: { question: string; answer: string }[];
  critique: string;
  revisedPlan: string;
  /** "naive" or this member's own name (their revised plan). */
  vote: string;
  confidence: number;
}

export interface Challenge {
  member: string;
  target: string;
  challenge: string;
  previousVote: string;
  finalVote: string;
  /** Computed from the two votes, not reported by the model. */
  defected: boolean;
  confidence: number;
}

export interface Verdict {
  winner: string;
  /** Share of the total vote weight that went to the winner. */
  confidence: number;
  votes: { member: string; vote: string; confidence: number; weight: number }[];
  dissent: string[];
}

export interface DecisionRecord {
  id: string;
  timestamp: number;
  prompt: string;
  naivePlan: string;
  positions: Position[];
  challenges: Challenge[];
  verdict: Verdict;
  finalPlan: string;
  /** Set by council_override: the option that should have won. */
  overriddenTo?: string;
}
