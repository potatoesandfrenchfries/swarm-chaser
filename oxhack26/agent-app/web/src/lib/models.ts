// Display copy of the assistant's model registry. The validating source of
// truth is agent/src/lib/models.ts: keep the two lists in sync, or the
// creating send is rejected by the agent's initialData schema.
export const MODELS = [
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5" },
  { id: "anthropic/claude-opus-5", name: "Claude Opus 5" },
  { id: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5" },
  { id: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
] as const;

export const DEFAULT_MODEL = MODELS[0].id;

export function modelName(id: string | undefined) {
  return MODELS.find((model) => model.id === id)?.name ?? id;
}
