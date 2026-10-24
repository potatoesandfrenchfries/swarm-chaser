import type { Llm } from "../src/llm.js";

export type Script = {
  /** Round 1 reply for a member. Defaults to backing their own plan at 0.8. */
  round1?: (member: string) => { vote: "naive" | "revised"; confidence: number };
  /** Round 2 reply for a member. Defaults to holding their round 1 vote. */
  round2?: (member: string, ownVote: string) => { target: string; vote: string; confidence: number };
};

/** A deterministic stand-in for Claude. Records every prompt so tests can inspect what each call saw. */
export function stubLlm(script: Script = {}) {
  const prompts: { kind: "text" | "round1" | "round2"; member?: string; prompt: string }[] = [];

  const llm: Llm = {
    async text({ prompt }) {
      prompts.push({ kind: "text", prompt });
      return prompt.includes("You are the Clerk") ? "FINAL PLAN from the clerk" : "NAIVE PLAN";
    },
    async object({ prompt, schema }) {
      const member = /You are ([A-Z]+)/.exec(prompt)?.[1] ?? "?";
      const round2 = prompt.includes("ALL ROUND 1 POSITIONS");
      prompts.push({ kind: round2 ? "round2" : "round1", member, prompt });

      if (!round2) {
        const r = script.round1?.(member) ?? { vote: "revised" as const, confidence: 0.8 };
        return schema.parse({
          framework_answers: [{ question: "q", answer: `${member}-ANSWER` }],
          critique: `${member}-CRITIQUE`,
          revised_plan: `${member}-PLAN`,
          vote: r.vote,
          confidence: r.confidence,
        });
      }
      const own = /You voted: (\S+)/.exec(prompt)?.[1] ?? "naive";
      const r = script.round2?.(member, own) ?? { target: member === "RAZOR" ? "GHOST" : "RAZOR", vote: own, confidence: 0.7 };
      return schema.parse({ challenge_target: r.target, challenge: `${member}-CHALLENGE`, final_vote: r.vote, confidence: r.confidence });
    },
  };
  return { llm, prompts };
}
