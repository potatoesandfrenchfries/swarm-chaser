import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { documentRetrievalNode } from "./nodes/document-retrieval";
import { draftNode } from "./nodes/draft";
import { finalizeNode } from "./nodes/finalize";
import { planNode } from "./nodes/plan";
import { verifyNode } from "./nodes/verify";
import { webSearchNode } from "./nodes/web-search";

// Small on purpose: only what must flow between nodes. Evidence and findings
// live in Supabase, so each node reads what it needs and a crash loses nothing.
const State = Annotation.Root({
  runId: Annotation<string>(),
  topic: Annotation<string>(),
  objective: Annotation<string | undefined>(),
  documentIds: Annotation<string[]>(),
  queries: Annotation<string[]>(),
});

export type GraphState = typeof State.State;

// Straight line, no branching. Add conditional edges (addConditionalEdges) when
// a stage should loop, e.g. verify -> web_search while evidence is too thin.
export function createResearchGraph() {
  return new StateGraph(State)
    .addNode("plan", planNode)
    .addNode("web_search", webSearchNode)
    .addNode("document_retrieval", documentRetrievalNode)
    .addNode("draft", draftNode)
    .addNode("verify", verifyNode)
    .addNode("finalize", finalizeNode)
    .addEdge(START, "plan")
    .addEdge("plan", "web_search")
    .addEdge("web_search", "document_retrieval")
    .addEdge("document_retrieval", "draft")
    .addEdge("draft", "verify")
    .addEdge("verify", "finalize")
    .addEdge("finalize", END)
    .compile();
}
