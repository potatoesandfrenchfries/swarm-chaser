import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";
import { Assistant } from "./agents/assistant.ts";
import { Researcher } from "./agents/researcher.ts";

const app = new Hono();

// A compressing proxy in front of the agent (Next's rewrite does gzip) holds
// event-stream bytes in its compressor, so live updates never reach the
// browser. `no-transform` tells intermediaries to pass the stream through.
app.use("/agents/*", async (c, next) => {
  await next();
  if (c.res.headers.get("content-type")?.startsWith("text/event-stream")) {
    c.res.headers.set("cache-control", "no-cache, no-transform");
  }
});

// One durable conversation per session id:
//
//   curl -X POST http://localhost:5173/agents/assistant/chat-1 \
//     -H 'content-type: application/json' \
//     -d '{"kind":"user","body":"Hello"}'
//
// The Next.js app in ../web rewrites /api/agents/* here, so the browser stays
// same-origin and no CORS setup is needed.
app.route("/agents/assistant", createAgentRouter(Assistant));
app.route("/agents/researcher", createAgentRouter(Researcher));

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
