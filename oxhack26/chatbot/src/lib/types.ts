export type Role = "user" | "assistant";
export type ProviderKind = "openai-compatible" | "anthropic";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  /** Set when the request failed or was cut off; shown under the message. */
  error?: string;
  /** True while the reply is being generated; checkpoints persist it so a crash can be detected. */
  streaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  presetId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
}
