import { openai } from "@ai-sdk/openai";
import { Output, generateText } from "ai";
import type { ZodType } from "zod";

const model = () => {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("Missing OPENAI_API_KEY.");
  return openai(process.env.AGENT_MODEL?.trim() || "gpt-5-mini");
};

/** The model must return an object matching `schema`; no string parsing. */
export async function generateObject<T>(args: { system: string; prompt: string; schema: ZodType<T> }) {
  const { output } = await generateText({
    model: model(),
    system: args.system,
    prompt: args.prompt,
    output: Output.object({ schema: args.schema }),
  });
  return output;
}

export async function generateReply(args: { system: string; prompt: string }) {
  const { text } = await generateText({ model: model(), system: args.system, prompt: args.prompt });
  return text.trim();
}
