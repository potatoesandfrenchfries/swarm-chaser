import { defineTool, type JsonValue } from "@flue/runtime";
import * as v from "valibot";

const MAX_RESULTS = 5;
const SNIPPET_CHARS = 500;

const UNAVAILABLE = { unavailable: true, results: [] } satisfies JsonValue;

// The web UI renders `results: [{ title, url, snippet }]` as a Sources block.
// Failures return `{ unavailable: true, results: [] }`, so `results` is always
// present and a missing key never crashes the transcript.
export const webSearch = defineTool({
  name: "web_search",
  description:
    "Search the public web. Use for current events, recent releases, prices, or any fact likely to have changed. Returns titled links with snippets.",
  input: v.object({
    query: v.pipe(v.string(), v.minLength(1), v.maxLength(400)),
  }),
  async run({ data, log }): Promise<{ output: JsonValue }> {
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) return { output: UNAVAILABLE };

    log.info(`Web search: ${data.query}`);
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query: data.query,
          max_results: MAX_RESULTS,
          search_depth: "basic",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return { output: UNAVAILABLE };

      const payload = (await response.json()) as {
        results?: { title?: string; url?: string; content?: string }[];
      };
      const results = (payload.results ?? []).slice(0, MAX_RESULTS).map((r) => ({
        title: r.title || r.url || "",
        url: r.url ?? "",
        snippet: (r.content ?? "").slice(0, SNIPPET_CHARS),
      }));
      return { output: { unavailable: results.length === 0, results } };
    } catch {
      return { output: UNAVAILABLE };
    }
  },
});
