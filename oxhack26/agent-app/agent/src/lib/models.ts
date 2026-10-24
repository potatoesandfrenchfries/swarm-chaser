// The model registry the assistant accepts. The web UI keeps a display copy in
// web/src/lib/models.ts: keep the two lists in sync, or the creating send is
// rejected by the agent's initialData schema.
export const MODELS = [
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5" },
  { id: "anthropic/claude-opus-5", name: "Claude Opus 5" },
  { id: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5" },
  { id: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export const MODEL_IDS = MODELS.map((model) => model.id);

export const DEFAULT_MODEL: ModelId = "anthropic/claude-sonnet-5";
