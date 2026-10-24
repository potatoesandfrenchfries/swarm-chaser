import { generateStructuredOutput } from "../ai";
import { appendEvent, listEvidence, replaceFindings } from "../repository";
import { draftSchema } from "../schemas";
import type { GraphState } from "../graph";
import { beginStage } from "./stage";

const EXCERPT_CHARS = 700;

export async function draftNode(state: GraphState) {
  await beginStage(state.runId, "draft");

  const evidence = await listEvidence(state.runId);
  if (!evidence.length) {
    await replaceFindings(state.runId, []);
    await appendEvent(state.runId, "draft", "no_evidence", "No evidence was gathered, nothing to draft.");
    return {};
  }

  // The model sees numbered labels (E1, E2...) instead of UUIDs: short enough
  // to cite reliably, and mapped back to ids below.
  const labelled = evidence.map((e, i) => ({ label: `E${i + 1}`, ...e }));
  const draft = await generateStructuredOutput({
    schema: draftSchema,
    system:
      "You write research findings. Every claim must be directly supported by the evidence you cite. Never use outside knowledge.",
    prompt: [
      `Topic: ${state.topic}`,
      state.objective ? `Objective: ${state.objective}` : "",
      "",
      "Evidence:",
      ...labelled.map(
        (e) => `[${e.label}] ${e.title}${e.url ? ` (${e.url})` : ""}\n${e.excerpt.slice(0, EXCERPT_CHARS)}`
      ),
      "",
      "Write up to 10 findings that answer the topic. Cite the labels that support each claim.",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const idByLabel = new Map(labelled.map((e) => [e.label, e.id]));
  // A finding with no resolvable citation is dropped, never saved uncited.
  const findings = draft.findings.flatMap((f) => {
    const evidenceIds = [...new Set(f.evidenceRefs.flatMap((ref) => idByLabel.get(ref.replace(/[[\]\s]/g, "")) ?? []))];
    return evidenceIds.length ? [{ claim: f.claim, evidenceIds, confidence: f.confidence }] : [];
  });

  await replaceFindings(state.runId, findings);
  await appendEvent(
    state.runId,
    "draft",
    "findings_drafted",
    `Drafted ${findings.length} findings (${draft.findings.length - findings.length} dropped for missing citations).`
  );
  return {};
}
