import { generateStructuredOutput } from "../ai";
import { appendEvent, completeRun, listEvidence, listFindings } from "../repository";
import { z } from "zod";
import type { GraphState } from "../graph";
import { beginStage } from "./stage";

const reportSchema = z.object({
  summary: z.string().describe("A 2 to 4 sentence executive summary."),
  body: z.string().describe("The findings as markdown prose, with [n] citations."),
});

export async function finalizeNode(state: GraphState) {
  await beginStage(state.runId, "finalize");

  const [findings, evidence] = await Promise.all([listFindings(state.runId), listEvidence(state.runId)]);
  const verified = findings.filter((f) => f.status === "verified");
  const open = findings.filter((f) => f.status !== "verified");

  // Number the sources that verified claims actually cite, in order of first use.
  const order: string[] = [];
  for (const f of verified) for (const id of f.evidenceIds) if (!order.includes(id)) order.push(id);
  const number = new Map(order.map((id, i) => [id, i + 1]));
  const byId = new Map(evidence.map((e) => [e.id, e]));

  let report = `# ${state.topic}\n\n`;
  if (verified.length) {
    const written = await generateStructuredOutput({
      schema: reportSchema,
      system: "You write concise research reports from verified findings only. Add no facts of your own.",
      prompt: [
        `Topic: ${state.topic}`,
        state.objective ? `Objective: ${state.objective}` : "",
        "Verified findings (cite with the bracketed numbers):",
        ...verified.map(
          (f) => `- ${f.claim} ${f.evidenceIds.map((id) => `[${number.get(id)}]`).join("")}`
        ),
      ]
        .filter(Boolean)
        .join("\n"),
    });
    report += `${written.summary}\n\n## Findings\n\n${written.body}\n\n## Sources\n\n`;
    report += order
      .map((id, i) => {
        const e = byId.get(id)!;
        return `${i + 1}. ${e.url ? `[${e.title}](${e.url})` : `${e.title} (uploaded document)`}`;
      })
      .join("\n");
  } else {
    report += "_No finding survived verification, so there is nothing to report._";
  }

  // Appended by code, not the model, so an unverified claim cannot slip into
  // the report body or be reworded into sounding established.
  if (open.length) {
    report += `\n\n## Needs review\n\nClaims the verifier could not fully support. Do not rely on these.\n\n`;
    report += open.map((f) => `- ${f.claim}${f.verificationNotes ? ` _(${f.verificationNotes})_` : ""}`).join("\n");
  }

  await completeRun(state.runId, report);
  await appendEvent(state.runId, "finalize", "run_completed", "Report ready.");
  return {};
}
