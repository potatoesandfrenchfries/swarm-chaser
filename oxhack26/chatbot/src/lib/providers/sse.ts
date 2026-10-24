/** Yields the payload of each `data:` line in a server-sent-events response. */
export async function* readSSE(res: Response): AsyncGenerator<string> {
  if (!res.body) throw new Error("Response has no body to stream.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const lines = function* (flush: boolean) {
    let i: number;
    while ((i = buffer.indexOf("\n")) >= 0) {
      yield buffer.slice(0, i).trimEnd();
      buffer = buffer.slice(i + 1);
    }
    if (flush && buffer) yield buffer.trimEnd();
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    for (const line of lines(done)) {
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
    if (done) return;
  }
}

/** Turns a failed response into a readable error, preferring the API's own message. */
export async function responseError(res: Response): Promise<Error> {
  const text = await res.text().catch(() => "");
  let detail = text;
  try {
    const json = JSON.parse(text);
    detail = json?.error?.message ?? json?.message ?? text;
  } catch {
    /* not JSON; use the raw text */
  }
  return new Error(
    `${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`
  );
}
