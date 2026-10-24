import type { StreamArgs } from ".";
import { readSSE, responseError } from "./sse";

/** Anthropic Messages API, called straight from the browser. */
export async function streamAnthropic({
  settings,
  messages,
  signal,
  onToken,
}: StreamArgs) {
  const res = await fetch(
    `${settings.baseUrl.replace(/\/+$/, "")}/v1/messages`,
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        // Required for browser-origin requests; the key never leaves this browser.
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 4096,
        stream: true,
        ...(settings.systemPrompt && { system: settings.systemPrompt }),
        messages,
      }),
    }
  );
  if (!res.ok) throw await responseError(res);

  for await (const data of readSSE(res)) {
    const event = JSON.parse(data);
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta"
    ) {
      onToken(event.delta.text);
    } else if (event.type === "error") {
      throw new Error(event.error?.message ?? "Stream error");
    }
  }
}
