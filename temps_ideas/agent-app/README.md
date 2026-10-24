# Agent app template

A [Flue](https://flueframework.com) agent server with a Next.js chat UI. Two
processes: the agent holds the model keys, tools and durable conversations; the
web app is a thin client that proxies to it.

Distilled from two hackathon builds, Skyla (chat + live data) and Orca
(orchestrator + specialist subagents).

**Stack:** Flue · Hono · Vite · valibot · Next.js (App Router) · React 19 · Tailwind CSS 3

## Run it

```bash
cd agent && pnpm install && cp .env.example .env     # add a model key
cd ../web && pnpm install
```

```bash
# terminal 1: agent, http://localhost:5173
cd agent && pnpm dev

# terminal 2: web, http://localhost:3000
cd web && pnpm dev
```

The browser only talks to Next. `web/next.config.mjs` rewrites `/api/agents/*`
to the agent (`FLUE_SERVER_URL`, default `http://localhost:5173`), so there is
no CORS setup and provider keys never reach the browser.

## What's in it

| Path                                | What                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `agent/src/agents/assistant.ts`     | Smallest useful agent: per-conversation model via `initialData`, optional search |
| `agent/src/agents/researcher.ts`    | Orchestrator pattern: `usePersistentState`, a custom tool, a subagent    |
| `agent/src/subagents/`              | Specialist with its own tools and skill (`defineSubagent`)               |
| `agent/src/skills/*/SKILL.md`       | Instructions loaded with `useSkill`                                      |
| `agent/src/tools/search.ts`         | `defineTool` example (Tavily web search; off without a key)              |
| `agent/src/app.ts`                  | Route map, plus the SSE `no-transform` fix                               |
| `web/src/components/chat-workspace.tsx` | `useFlueAgent`: history replay, streaming, stop, first-message send  |
| `web/src/components/message.tsx`    | Renders text, reasoning and tool-call parts                              |
| `web/src/lib/sessions.ts`           | Sidebar list in localStorage (the conversations live in Flue)            |
| `docs/`                             | Spec and demo-script stubs to fill in during the event                   |

## Add an agent

1. `agent/src/agents/my-agent.ts`: start the file with `'use agent'`, export a capitalized function, set `MyAgent.agentName`.
2. Mount it in `agent/src/app.ts` with `createAgentRouter`.
3. Add it to `AGENTS` in `web/src/lib/config.ts` so the UI can start it.

## Things to know

- **Two model lists.** `agent/src/lib/models.ts` validates; `web/src/lib/models.ts` is the display copy. Keep them in sync or the creating send is rejected.
- **`initialData` only rides the creating send.** The web app sends it with a conversation's first message. Agents with no `initialData` schema (the researcher) must be sent without it.
- **Conversations are SQLite** in `agent/data/` (gitignored). `agent/src/db.ts` is where to swap in Postgres or libSQL.
- **The `"use agent"` build warning is expected.** Rolldown does not preserve module directives; Flue reads it at compile time.
- **Next.js here is a recent major.** `web/AGENTS.md` tells coding agents to read `node_modules/next/dist/docs/` first.
