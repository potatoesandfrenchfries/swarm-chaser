import { createResearchGraph } from "./graph";
import {
  appendEvent,
  failRun,
  getRun,
  getRunSnapshot,
  listRunDocuments,
  resetRun,
} from "./repository";

export async function executeRun(runId: string) {
  const run = await getRun(runId);
  if (run.status === "completed") return getRunSnapshot(runId);
  // Anything mid-flight belongs to another request; only start fresh or retry a failure.
  if (run.status !== "queued" && run.status !== "failed") {
    throw new Error(`Run is already ${run.status}.`);
  }
  if (run.status === "failed") await resetRun(runId);

  try {
    const documents = await listRunDocuments(runId);
    await createResearchGraph().invoke({
      runId,
      topic: run.topic,
      objective: run.objective ?? undefined,
      documentIds: documents.map((d) => d.documentId),
      queries: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown research failure.";
    const { currentStage } = await getRun(runId);
    await failRun(runId, currentStage, message);
    await appendEvent(runId, currentStage, "stage_failed", message);
    throw error;
  }
  return getRunSnapshot(runId);
}
