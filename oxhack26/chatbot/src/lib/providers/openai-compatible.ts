import type { StreamArgs } from ".";
import { readSSE, responseError } from "./sse";

/** OpenAI, OpenRouter, Ollama, LM Studio, llama.cpp, vLLM: `/chat/completions`. */
export async function streamOpenAICompatible({
  settings,
  messages,
  signal,
  onToken,
}: StreamArgs) {
  const res = await fetch(
    `${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(settings.apiKey && { Authorization: `Bearer ${settings.apiKey}` }),
      },
      body: JSON.stringify({
        model: settings.model,
        stream: true,
        messages: [
          ...(settings.systemPrompt
            ? [{ role: "system", content: settings.systemPrompt }]
            : []),
          ...messages,
        ],
      }),
    }
  );
  if (!res.ok) throw await responseError(res);

  for await (const data of readSSE(res)) {
    if (data === "[DONE]") return;
    const text = JSON.parse(data)?.choices?.[0]?.delta?.content;
    if (text) onToken(text);
  }
}
