import { getPreset } from "../config";
import type { ChatMessage, Settings } from "../types";
import { streamAnthropic } from "./anthropic";
import { streamOpenAICompatible } from "./openai-compatible";

export interface StreamArgs {
  settings: Settings;
  messages: Pick<ChatMessage, "role" | "content">[];
  signal: AbortSignal;
  onToken: (text: string) => void;
}

/**
 * Streams a reply from the configured provider. To add a provider, write an
 * adapter with this signature and branch on its `kind` here.
 */
export function streamChat(args: StreamArgs): Promise<void> {
  const { kind } = getPreset(args.settings.presetId);
  return kind === "anthropic"
    ? streamAnthropic(args)
    : streamOpenAICompatible(args);
}
