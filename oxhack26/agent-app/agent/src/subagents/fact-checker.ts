import { defineSubagent, useSkill, useTool } from "@flue/runtime";
import factCheckerSkill from "../skills/fact-checker/SKILL.md";
import { webSearch } from "../tools/search.ts";

// A subagent is a normal agent function plus a name and description the parent
// reads when deciding whether to delegate. It gets its own tools and skill, so
// the parent's context stays small.
function FactChecker() {
  useTool(webSearch);
  useSkill(factCheckerSkill);
  return `You are fact_checker. Follow the fact-checker skill.`;
}

export const factChecker = defineSubagent({
  name: "fact_checker",
  description:
    "Checks a draft answer claim by claim against web sources and reports which claims are supported, contradicted or unverified.",
  agent: FactChecker,
});
