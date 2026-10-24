"use agent";
import { useModel, usePersistentState, useSubagent, useTool } from "@flue/runtime";
import * as v from "valibot";
import { DEFAULT_MODEL } from "../lib/models.ts";
import { factChecker } from "../subagents/fact-checker.ts";
import { webSearch } from "../tools/search.ts";

type Phase = "researching" | "checking" | "done";

// The multi-agent pattern: a parent that owns the workflow, persistent state
// that survives a restart, and a specialist subagent it delegates to.
// Grow it by adding more subagents and tools; keep this function thin.
export function Researcher() {
  useModel(process.env.RESEARCHER_MODEL || DEFAULT_MODEL);

  const [phase, setPhase] = usePersistentState<Phase>("phase", "researching");

  useTool(webSearch);
  useTool({
    name: "set_phase",
    description: "Record which phase the research is in. Call when you move on.",
    input: v.object({ phase: v.picklist(["researching", "checking", "done"]) }),
    async run({ data }) {
      setPhase(data.phase);
      return { output: { ok: true, phase: data.phase } };
    },
  });
  useSubagent(factChecker);

  return `You are a research agent. Current phase: ${phase}.

1. researching: use web_search, then write a draft answer with the sources you used.
2. checking: call set_phase("checking"), then delegate the draft to fact_checker.
3. done: fix anything contradicted or unverified, call set_phase("done"), and give the final answer with sources.

Never present a claim the fact checker marked contradicted.`;
}
Researcher.agentName = "researcher";
