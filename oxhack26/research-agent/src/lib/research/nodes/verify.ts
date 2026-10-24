import { generateStructuredOutput } from "../ai";
import { appendEvent, listEvidence, listFindings, updateFinding } from "../repository";
import { verdictSchema } from "../schemas";
import type { GraphState } from "../graph";
import { beginStage } from "./stage";

export async function verifyNode(state: GraphState) {
  await beginStage(state.runId, "verify");

  const [findings, evidence] = await Promise.all([listFindings(state.runId), listEvidence(state.runId)]);
  const byId = new Map(evidence.map((e) => [e.id, e]));

  // A separate call per claim, shown only the excerpts it cites: the verifier
  // cannot be talked into agreement by the rest of the draft.
  const verdicts = await Promise.all(
    findings.map(async (finding) => {
      const cited = finding.evidenceIds.flatMap((id) => byId.get(id) ?? []);
      const result = await generateStructuredOutput({
        schema: verdictSchema,
        system:
          "You are a strict fact checker. Judge a claim only against the excerpts given. 'supported' means the excerpts state it; 'partial' means they support only part; 'unsupported' means they do not.",
        prompt: `Claim: ${finding.claim}\n\nExcerpts:\n${cited.map((e, i) => `(${i + 1}) ${e.excerpt}`).join("\n\n")}`,
      });
      await updateFinding(
        finding.id,
        result.verdict === "supported" ? "verified" : "needs-review",
        result.notes
      );
      return result.verdict;
    })
  );

  const verified = verdicts.filter((v) => v === "supported").length;
  await appendEvent(
    state.runId,
    "verify",
    "findings_verified",
    `${verified} of ${findings.length} findings verified.`
  );
  return {};
}
