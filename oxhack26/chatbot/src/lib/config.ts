import type { ProviderKind } from "./types";

/** Template identity and defaults. Edit this file to make the bot your own. */
export const APP = {
  name: "Chatbot",
  tagline: "A local-first chat template. Bring your own key.",
  systemPrompt:
    "You are a helpful, concise assistant. Use Markdown when it helps readability.",
  /** Shown on the empty state; clicking one sends it. */
  suggestions: [
    "Explain how streaming responses work",
    "Draft a friendly email declining a meeting",
    "Give me a 3-step plan to learn TypeScript",
  ],
} as const;

export interface Preset {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  /** Local servers usually need no key. */
  needsKey: boolean;
  /** Suggestions for the model field; any model id can be typed instead. */
  models: string[];
}

export const PRESETS: Preset[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    models: [
      "anthropic/claude-sonnet-4.5",
      "openai/gpt-5",
      "google/gemini-2.5-pro",
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    needsKey: true,
    models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    models: ["gpt-5", "gpt-5-mini"],
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    kind: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    needsKey: false,
    models: ["qwen3:8b", "llama3.2"],
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    kind: "openai-compatible",
    baseUrl: "",
    needsKey: false,
    models: [],
  },
];

export function getPreset(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0]!;
}

const defaultPreset = getPreset(
  process.env.NEXT_PUBLIC_DEFAULT_PRESET ?? "openrouter"
);

export const DEFAULT_SETTINGS = {
  presetId: defaultPreset.id,
  baseUrl: defaultPreset.baseUrl,
  apiKey: "",
  model: defaultPreset.models[0] ?? "",
  systemPrompt: APP.systemPrompt as string,
};
