import { appendEvent, insertEvidence } from "../repository";
import { tavilyFromEnv } from "../search";
import type { GraphState } from "../graph";
import { beginStage } from "./stage";

export async function webSearchNode(state: GraphState) {
  await beginStage(state.runId, "web_search");

  const search = tavilyFromEnv();
  if (!search) {
    await appendEvent(state.runId, "web_search", "stage_skipped", "No TAVILY_API_KEY: web search skipped.");
    return {};
  }

  // One failed query should not sink the run: log it and keep the others.
  const settled = await Promise.allSettled(state.queries.map((q) => search.search(q)));
  const byUrl = new Map<string, { title: string; url: string; snippet: string; query: string }>();
  settled.forEach((result, i) => {
    if (result.status === "rejected") {
      void appendEvent(state.runId, "web_search", "query_failed", String(result.reason));
      return;
    }
    for (const r of result.value) if (!byUrl.has(r.url)) byUrl.set(r.url, { ...r, query: state.queries[i]! });
  });

  await insertEvidence(
    state.runId,
    [...byUrl.values()].map((r) => ({
      sourceType: "web" as const,
      title: r.title,
      url: r.url,
      excerpt: r.snippet,
      metadataJson: { query: r.query },
    }))
  );
  await appendEvent(state.runId, "web_search", "sources_found", `Found ${byUrl.size} web sources.`);
  return {};
}
