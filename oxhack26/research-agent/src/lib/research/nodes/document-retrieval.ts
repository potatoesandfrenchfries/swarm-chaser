import { embed } from "../ai";
import { appendEvent, insertEvidence, matchDocuments } from "../repository";
import type { GraphState } from "../graph";
import { beginStage } from "./stage";

const CHUNKS_PER_QUERY = 4;

export async function documentRetrievalNode(state: GraphState) {
  await beginStage(state.runId, "document_retrieval");

  if (!state.documentIds.length) {
    await appendEvent(state.runId, "document_retrieval", "stage_skipped", "No documents linked.");
    return {};
  }

  // Search with the topic itself plus each planned query, then dedupe by chunk.
  const queries = [state.topic, ...state.queries];
  const embeddings = await embed(queries);
  const lanes = await Promise.all(
    embeddings.map((e) => matchDocuments(e, state.documentIds, CHUNKS_PER_QUERY))
  );
  const chunks = new Map(lanes.flat().map((c) => [c.id, c]));

  await insertEvidence(
    state.runId,
    [...chunks.values()].map((c) => ({
      sourceType: "document" as const,
      title: String(c.metadata.file_name ?? "Document"),
      url: null,
      excerpt: c.content,
      metadataJson: {
        documentId: c.metadata.document_id,
        chunkIndex: c.metadata.chunk_index,
        similarity: c.similarity,
      },
    }))
  );
  await appendEvent(
    state.runId,
    "document_retrieval",
    "chunks_found",
    `Retrieved ${chunks.size} document chunks.`
  );
  return {};
}
