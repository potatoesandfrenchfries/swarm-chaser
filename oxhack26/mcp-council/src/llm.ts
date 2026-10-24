import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodType } from "zod";

/** What the council needs from a model. Tests supply a stub; production uses Claude. */
export interface Llm {
  /** One call whose reply must match `schema`. */
  object<T>(args: { prompt: string; schema: ZodType<T>; maxTokens?: number }): Promise<T>;
  /** One free-form text call. */
  text(args: { prompt: string; maxTokens?: number }): Promise<string>;
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export function claudeLlm(options: { model: string; effort: Effort }): Llm {
  // Resolves credentials from the environment (ANTHROPIC_API_KEY, or an `ant auth login` profile).
  const client = new Anthropic();

  const base = (prompt: string, maxTokens: number) => ({
    model: options.model,
    max_tokens: maxTokens,
    messages: [{ role: "user" as const, content: prompt }],
    // Thinking is always on for this model; effort is the only depth control.
    // Server-side fallback: if a safety classifier declines the request, the API
    // retries on a fallback model instead of returning a refusal.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
  });

  return {
    async object<T>({ prompt, schema, maxTokens = 16000 }: { prompt: string; schema: ZodType<T>; maxTokens?: number }) {
      const response = await client.beta.messages.parse({
        ...base(prompt, maxTokens),
        output_config: { effort: options.effort, format: zodOutputFormat(schema) },
      });
      if (response.stop_reason === "refusal") {
        throw new Error(`The model declined this request (${response.stop_details?.category ?? "no category"}).`);
      }
      if (response.parsed_output == null) {
        throw new Error(`The model's reply did not match the expected schema (stop_reason: ${response.stop_reason}).`);
      }
      return response.parsed_output as T;
    },

    async text({ prompt, maxTokens = 16000 }) {
      const response = await client.beta.messages.create({
        ...base(prompt, maxTokens),
        output_config: { effort: options.effort },
      });
      if (response.stop_reason === "refusal") {
        throw new Error(`The model declined this request (${response.stop_details?.category ?? "no category"}).`);
      }
      return response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n")
        .trim();
    },
  };
}
