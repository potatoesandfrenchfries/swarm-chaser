"use agent";
import { useInitialData, useModel, useTool } from "@flue/runtime";
import * as v from "valibot";
import { DEFAULT_MODEL, MODEL_IDS } from "../lib/models.ts";
import { webSearch } from "../tools/search.ts";

// A general-purpose chat agent, the smallest useful Flue agent. The web UI
// picks the model per conversation: the creating send carries
// `initialData: { model }`, validated below. Conversations created without it
// use DEFAULT_MODEL.
export function Assistant() {
  const init = useInitialData<v.InferOutput<typeof Assistant.initialData>>();
  useModel(init?.model ?? DEFAULT_MODEL);

  const searchEnabled = Boolean(process.env.TAVILY_API_KEY);
  if (searchEnabled) useTool(webSearch);

  return `You are a helpful, general-purpose AI assistant.

- Answer in well-structured markdown; tag code blocks with their language.
- Be direct and concise by default; expand when the question calls for it.
- If you lack the information to answer, say so plainly instead of guessing.${
    searchEnabled
      ? `
- You have a web_search tool. Use it for anything likely to have changed since your training data, then say which sources you used.`
      : ""
  }`;
}
Assistant.agentName = "assistant";
// strictObject so a misnamed key fails the creating send instead of silently
// pinning the conversation to the default model; nullish so JSON null (the
// natural "no preference" serialization) is accepted like absence.
Assistant.initialData = v.nullish(
  v.strictObject({
    model: v.nullish(v.picklist(MODEL_IDS)),
  }),
);
