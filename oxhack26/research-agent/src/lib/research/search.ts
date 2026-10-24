export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchService {
  search(query: string): Promise<WebResult[]>;
}

/** Tavily web search. `null` from `tavilyFromEnv` means no key: skip the stage. */
export class TavilySearchService implements WebSearchService {
  constructor(private readonly apiKey: string) {}

  async search(query: string) {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ query, max_results: 5, search_depth: "advanced" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Tavily ${response.status} for "${query}"`);
    const payload = (await response.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    return (payload.results ?? []).flatMap((r) =>
      r.url ? [{ title: r.title || r.url, url: r.url, snippet: r.content ?? "" }] : []
    );
  }
}

export function tavilyFromEnv() {
  const key = process.env.TAVILY_API_KEY?.trim();
  return key ? new TavilySearchService(key) : null;
}
