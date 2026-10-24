import { generateStructuredOutput } from "../ai";
import { appendEvent, savePlan } from "../repository";
import { planSchema } from "../schemas";
import type { GraphState } from "../graph";
import { beginStage } from "./stage";

export async function planNode(state: GraphState) {
  await beginStage(state.runId, "plan");

  const plan = await generateStructuredOutput({
    schema: planSchema,
    system: "You plan web research. Queries must be specific, distinct, and searchable.",
    prompt: [
      `Topic: ${state.topic}`,
      state.objective ? `Objective: ${state.objective}` : "",
      "Write 3 to 5 web search queries that together cover the topic. Give each a one-line purpose.",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  await savePlan(state.runId, plan);
  await appendEvent(state.runId, "plan", "plan_created", `Planned ${plan.queries.length} queries.`);
  return { queries: plan.queries.map((q) => q.query) };
}
