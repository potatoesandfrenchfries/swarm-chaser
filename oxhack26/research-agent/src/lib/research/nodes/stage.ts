import { appendEvent, setRunStage } from "../repository";
import { STAGES, type StageKey } from "../schemas";

/** Mark a stage as started: updates the run's status and logs the event. */
export async function beginStage(runId: string, key: StageKey) {
  const stage = STAGES.find((s) => s.key === key)!;
  await setRunStage(runId, stage.status, key);
  await appendEvent(runId, key, "stage_started", `${stage.label} started.`);
}
