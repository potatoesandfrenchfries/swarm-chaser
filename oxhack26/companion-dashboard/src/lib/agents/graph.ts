import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { companionAgent } from "./companion";
import { concernAgent } from "./concern";
import { supervisor } from "./supervisor";
import { taskAgent } from "./task";

export const ROUTES = ["task", "concern", "chat"] as const;
export type Route = (typeof ROUTES)[number];

// What flows between nodes. The data itself (tasks, notes, messages) lives in
// SQLite; agents read and write it through lib/db.ts.
const State = Annotation.Root({
  input: Annotation<string>(),
  role: Annotation<"member" | "overseer">(),
  route: Annotation<Route | undefined>(),
  reply: Annotation<string | undefined>(),
});

export type GraphState = typeof State.State;

// supervisor -> one specialist. The specialist that acts (task, concern) writes
// the reply from what actually happened in the database, so it cannot claim a
// change it did not make. "chat" is the fallback and the only free-form reply.
export const graph = new StateGraph(State)
  .addNode("supervisor", supervisor)
  .addNode("task", taskAgent)
  .addNode("concern", concernAgent)
  .addNode("chat", companionAgent)
  .addEdge(START, "supervisor")
  .addConditionalEdges("supervisor", (state) => state.route ?? "chat", ["task", "concern", "chat"])
  .addEdge("task", END)
  .addEdge("concern", END)
  .addEdge("chat", END)
  .compile();
