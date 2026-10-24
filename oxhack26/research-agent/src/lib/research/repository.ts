import { createSupabaseServerClient } from "~/lib/supabase";
import type {
  Evidence,
  Finding,
  Run,
  RunDocument,
  RunEvent,
  RunSnapshot,
  RunStatus,
} from "./schemas";

type Row = Record<string, unknown>;

const db = () => createSupabaseServerClient();

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

/** snake_case row -> camelCase object (jsonb columns are left untouched). */
function camel<T>(row: Row): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      value,
    ])
  ) as T;
}

// ---- runs

export async function createRun(input: {
  topic: string;
  objective?: string | null;
  documentIds: string[];
}) {
  const { data, error } = await db()
    .from("research_runs")
    .insert({ topic: input.topic, objective: input.objective ?? null })
    .select()
    .single();
  fail(error);
  const run = camel<Run>(data);

  if (input.documentIds.length) {
    const names = await listDocuments(input.documentIds);
    const { error: linkError } = await db()
      .from("research_run_documents")
      .insert(
        input.documentIds.map((documentId) => ({
          run_id: run.id,
          document_id: documentId,
          file_name: names.find((d) => d.documentId === documentId)?.fileName ?? null,
        }))
      );
    fail(linkError);
  }
  return run;
}

export async function getRun(id: string) {
  const { data, error } = await db().from("research_runs").select().eq("id", id).single();
  fail(error);
  return camel<Run>(data);
}

export async function listRuns() {
  const { data, error } = await db()
    .from("research_runs")
    .select()
    .order("created_at", { ascending: false })
    .limit(50);
  fail(error);
  return (data ?? []).map((row) => camel<Run>(row));
}

export async function setRunStage(id: string, status: RunStatus, stage: string) {
  const { error } = await db()
    .from("research_runs")
    .update({ status, current_stage: stage, updated_at: new Date().toISOString() })
    .eq("id", id);
  fail(error);
}

export async function savePlan(id: string, plan: unknown) {
  const { error } = await db().from("research_runs").update({ plan_json: plan }).eq("id", id);
  fail(error);
}

export async function completeRun(id: string, reportMarkdown: string) {
  const { error } = await db()
    .from("research_runs")
    .update({
      status: "completed",
      current_stage: "finalize",
      final_report_markdown: reportMarkdown,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  fail(error);
}

export async function failRun(id: string, stage: string, message: string) {
  const { error } = await db()
    .from("research_runs")
    .update({
      status: "failed",
      current_stage: stage,
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  fail(error);
}

// ---- events

export async function appendEvent(
  runId: string,
  stage: string,
  eventType: string,
  message: string,
  payload: Record<string, unknown> = {}
) {
  const { error } = await db()
    .from("research_events")
    .insert({ run_id: runId, stage, event_type: eventType, message, payload_json: payload });
  fail(error);
}

export async function listEvents(runId: string) {
  const { data, error } = await db()
    .from("research_events")
    .select("id, stage, event_type, message, created_at")
    .eq("run_id", runId)
    .order("id");
  fail(error);
  return (data ?? []).map((row) => camel<RunEvent>(row));
}

// ---- evidence

export async function insertEvidence(
  runId: string,
  rows: Pick<Evidence, "sourceType" | "title" | "url" | "excerpt" | "metadataJson">[]
) {
  if (!rows.length) return [];
  const { data, error } = await db()
    .from("research_evidence")
    .insert(
      rows.map((r) => ({
        run_id: runId,
        source_type: r.sourceType,
        title: r.title,
        url: r.url,
        excerpt: r.excerpt,
        metadata_json: r.metadataJson,
      }))
    )
    .select();
  fail(error);
  return (data ?? []).map((row) => camel<Evidence>(row));
}

/** Oldest first, so a label like "E3" always means the same row for a run. */
export async function listEvidence(runId: string) {
  const { data, error } = await db()
    .from("research_evidence")
    .select()
    .eq("run_id", runId)
    .order("created_at")
    .order("id");
  fail(error);
  return (data ?? []).map((row) => camel<Evidence>(row));
}

// ---- findings

export async function replaceFindings(
  runId: string,
  findings: Pick<Finding, "claim" | "evidenceIds" | "confidence">[]
) {
  const { error: deleteError } = await db().from("research_findings").delete().eq("run_id", runId);
  fail(deleteError);
  if (!findings.length) return [];
  const { data, error } = await db()
    .from("research_findings")
    .insert(
      findings.map((f) => ({
        run_id: runId,
        claim: f.claim,
        evidence_ids: f.evidenceIds,
        confidence: f.confidence,
      }))
    )
    .select();
  fail(error);
  return (data ?? []).map((row) => camel<Finding>(row));
}

export async function listFindings(runId: string) {
  const { data, error } = await db()
    .from("research_findings")
    .select()
    .eq("run_id", runId)
    .order("created_at")
    .order("id");
  fail(error);
  return (data ?? []).map((row) => camel<Finding>(row));
}

export async function updateFinding(
  id: string,
  status: Finding["status"],
  verificationNotes: string
) {
  const { error } = await db()
    .from("research_findings")
    .update({ status, verification_notes: verificationNotes })
    .eq("id", id);
  fail(error);
}

// ---- documents

export async function listRunDocuments(runId: string) {
  const { data, error } = await db()
    .from("research_run_documents")
    .select("document_id, file_name")
    .eq("run_id", runId);
  fail(error);
  return (data ?? []).map((row) => camel<RunDocument>(row));
}

/** One entry per uploaded file (its first chunk carries the file metadata). */
export async function listDocuments(only?: string[]) {
  let query = db()
    .from("documents")
    .select("metadata")
    .eq("metadata->>chunk_index", "0")
    .order("id", { ascending: false });
  if (only?.length) query = query.in("metadata->>document_id", only);
  const { data, error } = await query;
  fail(error);
  return (data ?? []).map((row) => {
    const m = row.metadata as Record<string, unknown>;
    return {
      documentId: String(m.document_id),
      fileName: typeof m.file_name === "string" ? m.file_name : null,
      totalChunks: typeof m.total_chunks === "number" ? m.total_chunks : 0,
      uploadDate: typeof m.upload_date === "string" ? m.upload_date : null,
    };
  });
}

export async function matchDocuments(embedding: number[], documentIds: string[], count: number) {
  const { data, error } = await db().rpc("match_documents", {
    query_embedding: embedding,
    match_count: count,
    document_ids: documentIds,
  });
  fail(error);
  return (data ?? []) as {
    id: number;
    content: string;
    metadata: Record<string, unknown>;
    similarity: number;
  }[];
}

export async function insertChunks(
  chunks: { content: string; metadata: Record<string, unknown>; embedding: number[] }[]
) {
  const { error } = await db()
    .from("documents")
    .insert(chunks.map((c) => ({ ...c, embedding: JSON.stringify(c.embedding) })));
  fail(error);
}

// ---- snapshot

export async function getRunSnapshot(id: string): Promise<RunSnapshot> {
  const [run, events, evidence, findings, documents] = await Promise.all([
    getRun(id),
    listEvents(id),
    listEvidence(id),
    listFindings(id),
    listRunDocuments(id),
  ]);
  return { run, events, evidence, findings, documents };
}

/** Clear everything a previous attempt produced, so a failed run can be retried. */
export async function resetRun(id: string) {
  for (const table of ["research_events", "research_evidence", "research_findings"]) {
    const { error } = await db().from(table).delete().eq("run_id", id);
    fail(error);
  }
  const { error } = await db()
    .from("research_runs")
    .update({
      status: "queued",
      current_stage: "plan",
      plan_json: null,
      final_report_markdown: null,
      error_message: null,
    })
    .eq("id", id);
  fail(error);
}
