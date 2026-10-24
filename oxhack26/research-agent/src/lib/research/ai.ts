import { openai } from "@ai-sdk/openai";
import { Output, embedMany, generateText } from "ai";
import type { ZodType } from "zod";

const RESEARCH_MODEL = process.env.RESEARCH_MODEL?.trim() || "gpt-5-mini";
export const EMBEDDING_MODEL = "text-embedding-3-small";

function requireKey() {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("Missing OPENAI_API_KEY.");
}

/** One structured LLM call: the model must return an object matching `schema`. */
export async function generateStructuredOutput<T>({
  prompt,
  schema,
  system,
}: {
  prompt: string;
  schema: ZodType<T>;
  system?: string;
}) {
  requireKey();
  const { output } = await generateText({
    model: openai(RESEARCH_MODEL),
    system,
    output: Output.object({ schema }),
    prompt,
  });
  return output;
}

/** Embeddings for document chunks and queries (1536 dims, matching the SQL). */
export async function embed(values: string[]) {
  requireKey();
  const { embeddings } = await embedMany({
    model: openai.embedding(EMBEDDING_MODEL),
    values,
  });
  return embeddings;
}
