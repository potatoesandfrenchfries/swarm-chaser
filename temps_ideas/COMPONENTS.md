# Components

Map of this repo for coding agents. Each top-level folder is an independent
template: its own `package.json`, lockfile and `.env.example`. Nothing is
shared between them at build time. Copy a folder out, or combine several (see
[Combining components](#combining-components)).

Facts here are taken from each template's README and source. If a README and
this file disagree, trust the README and fix this file.

## Pick a component

| The project needs...                                      | Use                                   |
| --------------------------------------------------------- | ------------------------------------- |
| Event landing page, registration, dashboard               | [`frontend`](#frontend)               |
| Chat UI that calls a model provider straight from browser | [`chatbot`](#chatbot)                 |
| Server-side agent with tools, subagents, durable chats    | [`agent-app`](#agent-app)             |
| Multi-stage research that ends in a cited report          | [`research-agent`](#research-agent)   |
| An agent for one person plus a dashboard for their overseer | [`companion-dashboard`](#companion-dashboard) |
| Real-time multiplayer: rooms, host, live scores           | [`live-game`](#live-game)             |
| Sign-in, a database, payments, rate limits: a SaaS base   | [`saas-starter`](#saas-starter)       |
| An MCP server that makes an agent justify a plan          | [`mcp-council`](#mcp-council)         |
| A what-if simulator for a network on a map                | [`map-sim`](#map-sim)                 |
| Watch what organizations say, check it, keep the record   | [`claims-ledger`](#claims-ledger)     |
| Tune a bot or parameter set by evolving it overnight      | [`evolve-harness`](#evolve-harness)   |
| Reusable skills shared across coding agents               | [`agent-skills`](#agent-skills)       |

## At a glance

| Folder           | Kind                         | Backend                              | Persistence               | Needs keys?                          | Dev port       |
| ---------------- | ---------------------------- | ------------------------------------ | ------------------------- | ------------------------------------ | -------------- |
| `frontend`       | Next.js site (App Router)    | None                                 | None                      | No                                   | 3000           |
| `chatbot`        | Next.js static export        | None (browser calls provider)        | IndexedDB (Dexie)         | User pastes key in Settings          | 3000           |
| `agent-app`      | Two processes: Flue + Next   | Flue agent server (Hono, Vite)       | SQLite in `agent/data/`   | Yes, in `agent/.env`                 | 5173 + 3000    |
| `research-agent` | Next.js + LangGraph          | Next.js route handlers               | Supabase Postgres + pgvector | Yes: Supabase, OpenAI, Tavily (opt.) | 3000           |
| `companion-dashboard` | Next.js + LangGraph     | Next.js route handlers               | SQLite (`node:sqlite`) in `data/app.db` | Yes: OpenAI                | 3000           |
| `live-game`      | Two processes: PartyKit + Next | PartyKit room server (WebSockets) | In memory only            | No                                   | 1999 + 3000    |
| `saas-starter`   | Next.js + Prisma + Stripe    | Next.js route handlers               | Postgres (Prisma)         | Yes: database URL and auth secret; Stripe optional | 3000     |
| `mcp-council`    | Node MCP server (stdio)      | The server itself                    | JSON file in `.council/`  | Yes: Anthropic                       | n/a (stdio)    |
| `map-sim`        | Vite single-page app         | None                                 | `localStorage`            | No (MapLibre needs no token)         | 5173           |
| `claims-ledger`  | Python pipeline + static viewer | None (a scheduled job)            | Files, committed to git   | No                                   | n/a            |
| `evolve-harness` | Python CLI                   | None                                 | Archive folder of JSON    | No                                   | n/a            |
| `agent-skills`   | Shell scripts + `SKILL.md`   | None                                 | Files, symlinked          | No                                   | n/a            |

Common to every Next.js template (`frontend`, `chatbot`, `research-agent`,
`companion-dashboard`, `live-game`, `saas-starter`, `agent-app/web`): pnpm,
React 19, TypeScript, Tailwind CSS 3, `lucide-react`, `clsx` + `tailwind-merge`,
and the scripts `dev`, `build`, `lint`, `typecheck`, `format`. Ports are Next's
default, so two templates cannot run on 3000 at once. `map-sim` shares the
React 19 / Tailwind 3 / pnpm stack but is a Vite app (port 5173, the same as
`agent-app`'s agent), and `mcp-council`, `claims-ledger` and `evolve-harness`
are not web apps. `claims-ledger` and `evolve-harness` need only Python 3.10+
and have no dependencies to install.

---

## frontend

**ID:** `frontend` · **Package:** `event-site-template`
**What:** Landing page and signed-in shell for a conference, festival or
community event, with two swappable themes.
**Stack:** Next.js · React 19 · Tailwind 3 · GSAP · Radix Slot · CVA · Sonner

**Choose when:** the deliverable is an event or marketing site.
**Skip when:** the project needs auth, a database, uploads or email. None are
included. `DESIGN.md` §9 lists where to plug them in.

### Routes

| Route                  | Source                                       |
| ---------------------- | -------------------------------------------- |
| `/`                    | `src/app/(landing)/page.tsx`                 |
| `/registration-closed` | `src/app/(landing)/registration-closed/`     |
| `/register`            | `src/app/(app)/register/`                    |
| `/status`              | `src/app/(app)/status/` (`?state=confirmed\|declined`) |
| `/dashboard`           | `src/app/(app)/dashboard/` (`?tab=`)         |

### Where to change things

| Change                                  | Edit                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| Event name, dates, location, CTA        | `src/lib/constants/site.ts`                                    |
| Nav and social links                    | `src/lib/constants/navigation.ts`                              |
| Schedule, sponsors, team, FAQ, about    | `src/lib/constants/{schedule,sponsors,team,faq,about}.ts`      |
| Colours, spacing, clip-path shapes      | `src/styles/globals.css`                                       |
| Fonts                                   | `src/themes/<theme>/fonts.ts`                                  |
| Logo                                    | `src/components/brand/logo-mark.tsx` (placeholder)             |
| Images                                  | `public/{photos,sponsors,team}/`                               |
| Active theme                            | `NEXT_PUBLIC_THEME` (`blueprint` \| `railway`), build-time     |
| Registration open or closed             | `NEXT_PUBLIC_REGISTRATION` (`open` \| `closed`)                |

Event content is data in `src/lib/constants/`, not JSX. Edit there first.

### Structure

| Folder                         | Holds                                                              |
| ------------------------------ | ------------------------------------------------------------------ |
| `src/app/(landing)/`           | Navbar + footer layout, landing page                               |
| `src/app/(app)/`               | Framed layout for register, status, dashboard                      |
| `src/components/layout/`       | Navbar, mobile menu, footer, section, container                    |
| `src/components/module/`       | Motifs and page sections (`sections/`, `dashboard/`, `register/`)  |
| `src/components/ui/`           | Button, chamfer button, input, label, toaster                      |
| `src/components/brand/`        | Logo mark                                                          |
| `src/themes/`                  | `blueprint/`, `railway/`, `index.ts` registry, `config.ts`         |
| `src/hooks/`, `src/lib/`       | `use-scramble`, `use-tabs`; constants, GSAP setup, utils           |

### Themes

A theme is tokens, fonts and three structural pieces (header, footer, landing
page), registered in `src/themes/index.ts`. Everything else (register, status,
dashboard, buttons, inputs) uses semantic tokens and re-themes itself.
`src/themes/config.ts` has no component imports, so it is safe to import
anywhere. Design rules: `DESIGN.md` (blueprint), `DESIGN.railway.md`
(railway, includes "Adding a theme").

---

## chatbot

**ID:** `chatbot` · **Package:** `chatbot-template`
**What:** Local-first chat UI. A static site with no backend; the browser
streams from the provider and history lives in IndexedDB.
**Stack:** Next.js (static export) · Tailwind 3 · Zustand · Dexie · react-markdown

**Choose when:** a self-contained chat UI is enough and keys can live in the
user's browser.
**Skip when:** keys must stay secret (public deployment), or the bot needs
server-side tools. Use `agent-app`. For a public build put a proxy in front.

### Where to change things

| Change                                        | Edit                                                        |
| --------------------------------------------- | ----------------------------------------------------------- |
| App name, tagline, system prompt, suggestions | `src/lib/config.ts` (`APP`)                                 |
| Provider presets and suggested model ids      | `src/lib/config.ts` (`PRESETS`)                             |
| Colour tokens (HSL), Markdown styling         | `src/app/globals.css`                                       |
| Add a provider                                | New `streamX(args: StreamArgs)` in `src/lib/providers/`, add a `kind` to `ProviderKind` in `src/lib/types.ts`, branch on it in `providers/index.ts` |
| Chat state, send/stop flow                    | `src/lib/store.ts`                                          |
| IndexedDB schema                              | `src/lib/db.ts`                                             |
| UI                                            | `src/components/` (`chat-app`, `composer`, `message`, `sidebar`, `settings-dialog`, `markdown`) |
| Default preset at build time                  | `NEXT_PUBLIC_DEFAULT_PRESET`                                |

Providers shipped: OpenRouter, Anthropic, OpenAI, Ollama, any
OpenAI-compatible URL (`providers/{anthropic,openai-compatible,sse}.ts`).
There is deliberately no API-key env var.

Not included: attachments, web search, regenerate/edit, export, tests.

---

## agent-app

**ID:** `agent-app`
**What:** A [Flue](https://flueframework.com) agent server plus a Next.js chat
UI. The agent holds model keys, tools and durable conversations; the web app
is a thin client that proxies to it.
**Stack:** Flue · Hono · Vite · valibot · Next.js · Tailwind 3

**Choose when:** the agent needs server-side tools, subagents, skills, or
conversations that survive a refresh.
**Skip when:** a plain chat UI is enough (`chatbot`).

Two sub-projects, each with its own install:

| Path     | Role                                  | Run                                          |
| -------- | ------------------------------------- | -------------------------------------------- |
| `agent/` | Flue server, keys and tools           | `cd agent && pnpm dev` (http://localhost:5173) |
| `web/`   | Next.js client                        | `cd web && pnpm dev` (http://localhost:3000)   |
| `docs/`  | `spec.md`, `demo.md` stubs to fill in | n/a                                          |

The browser only talks to Next. `web/next.config.mjs` rewrites `/api/agents/*`
to `FLUE_SERVER_URL` (default `http://localhost:5173`), so there is no CORS
setup and provider keys never reach the browser.

### Agent side (`agent/src/`)

| Path                      | What                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| `agents/assistant.ts`     | Smallest useful agent: per-conversation model via `initialData`, optional search |
| `agents/researcher.ts`    | Orchestrator: `usePersistentState`, a custom tool, a subagent        |
| `subagents/fact-checker.ts` | Specialist with its own tools and skill (`defineSubagent`)         |
| `skills/<name>/SKILL.md`  | Instructions loaded with `useSkill`                                  |
| `tools/search.ts`         | `defineTool` example (Tavily; off without a key)                     |
| `app.ts`                  | Route map; every agent is mounted here explicitly; SSE `no-transform` fix |
| `db.ts`                   | Persistence adapter (SQLite; swap for Postgres or libSQL here)       |
| `lib/models.ts`           | Validated model registry                                             |

An agent module starts with the `'use agent'` directive; every exported
capitalized function is an agent and its name is its durable identity.
Agent commands: `pnpm dev`, `pnpm build` then `pnpm start`, `pnpm typecheck`,
`npx flue run src/agents/assistant.ts --message "Hi"`, `npx flue docs search <q>`,
`npx flue add` (blueprints for channels, sandboxes, databases).

### Web side (`web/src/`)

| Path                         | What                                                          |
| ---------------------------- | ------------------------------------------------------------- |
| `app/page.tsx`, `app/chat/[id]/page.tsx` | Home and conversation routes                      |
| `components/chat-workspace.tsx` | `useFlueAgent`: history replay, streaming, stop, first send |
| `components/message.tsx`     | Renders text, reasoning and tool-call parts                   |
| `components/{composer,sidebar,shell,new-chat,markdown}.tsx` | Chat chrome            |
| `lib/config.ts`              | `APP` and `AGENTS` (what the UI can start)                    |
| `lib/models.ts`              | Display copy of the model list                                |
| `lib/sessions.ts`            | Sidebar list in localStorage                                  |

### Add an agent

1. `agent/src/agents/my-agent.ts`: first line `'use agent'`, export a capitalized function, set `MyAgent.agentName`.
2. Mount it in `agent/src/app.ts` with `createAgentRouter`.
3. Add it to `AGENTS` in `web/src/lib/config.ts`.

### Gotchas

- **Two model lists.** `agent/src/lib/models.ts` validates, `web/src/lib/models.ts` displays. Keep them in sync or the creating send is rejected.
- **`initialData` only rides the first message.** Agents with no `initialData` schema (the researcher) must be sent without it.
- **Conversations are SQLite** in `agent/data/` (gitignored).
- **The `"use agent"` build warning is expected.**
- **Next.js here is a recent major.** Read `web/AGENTS.md`: check `node_modules/next/dist/docs/` before writing Next code, because APIs may differ from what you remember.

Env: `agent/.env` needs at least one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GEMINI_API_KEY`; `TAVILY_API_KEY` is optional and enables `web_search`.
`web/.env` can set `FLUE_SERVER_URL`.

---

## research-agent

**ID:** `research-agent` · **Package:** `research-agent-template`
**What:** Staged research runs that end in a cited report. A LangGraph
pipeline plans queries, searches the web and uploaded documents, drafts
findings that must cite evidence, verifies each claim, and writes a report
from verified claims only.
**Stack:** Next.js · LangGraph · Vercel AI SDK · Supabase (Postgres +
pgvector) · Tavily · zod

**Choose when:** the output must be a report whose claims trace to sources.
**Skip when:** the project cannot run Supabase and OpenAI. It has not been run
end to end in this repo (it typechecks, lints, builds, and the graph compiles).

### Pipeline

```
plan -> web_search -> document_retrieval -> draft -> verify -> finalize
```

Stage files live in `src/lib/research/nodes/`. The graph is
`src/lib/research/graph.ts` and the stage list is `STAGES` in `schemas.ts`.

### Where to change things

| Change                           | Edit                                                           |
| -------------------------------- | -------------------------------------------------------------- |
| Stages or their order            | `lib/research/graph.ts` and `STAGES` in `schemas.ts`           |
| Loop back when evidence is thin  | `addConditionalEdges` after `verify` in `graph.ts`             |
| Model                            | `RESEARCH_MODEL` env, or `lib/research/ai.ts`                  |
| Search provider                  | Implement `WebSearchService` in `lib/research/search.ts`       |
| Supported file types             | `extractText` in `lib/research/ingest.ts`                      |
| Persistence queries              | `lib/research/repository.ts`                                   |
| Styling                          | CSS variables in `src/app/globals.css`                         |

### Other paths

| Path                                         | What                                          |
| -------------------------------------------- | --------------------------------------------- |
| `supabase/migrations/`                       | Run both files in the SQL editor, in order    |
| `src/app/{research,documents}/`              | Runs list, run detail, documents pages        |
| `src/app/api/{research/runs,documents,upload}/` | Route handlers; execution is in `runs/[id]/execute` |
| `src/lib/supabase.ts`, `src/lib/http.ts`     | Server-side client, request helpers           |
| `src/components/run-view.tsx`                | Polls run state                               |

### Invariants to keep

- Evidence is one table (`research_evidence`); web results and document chunks cite the same way.
- Graph state stays tiny. Nodes read and write Supabase, so a crash loses nothing.
- Citations are checked in code, and "Needs review" is appended outside the LLM.
- The browser never talks to Supabase. `SUPABASE_SERVICE_ROLE_KEY` must never get a `NEXT_PUBLIC_` prefix.
- A run executes inside one request (`maxDuration = 300`). Move `executeRun` to a queue if runs can outlast the host's limit.

Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`,
`RESEARCH_MODEL` (optional), `TAVILY_API_KEY` (optional; without it the web
stage is skipped).

---

## companion-dashboard

**ID:** `companion-dashboard` · **Package:** `companion-dashboard-template`
**What:** An agent that looks after one person, plus a dashboard for whoever
looks after them. Two views of the same data: `/member` (large type, today's
list, a companion to talk to) and `/overseer` (concerns the agent recorded,
the list, the member's conversation, an assistant that briefs them).
**Stack:** Next.js · LangGraph · Vercel AI SDK · SQLite via `node:sqlite` · zod

**Choose when:** the product is "someone, and the person responsible for them"
(care, tutoring, support, onboarding) and the overseer needs to see what the
agent heard.
**Skip when:** there is more than one member or any real auth requirement. It
has one hard-coded member and no sign-in. Needs Node 22.13+.

### Agent graph

```
message -> supervisor -> task     add / complete / remove / list the to-do list
                      -> concern  record a note for the overseer, with a severity
                      -> chat     warm companion (member) or briefing (overseer)
```

Wiring is `src/lib/agents/graph.ts`; one file per node beside it
(`supervisor`, `task`, `concern`, `companion`). The supervisor returns a typed
route, not parsed text.

### Where to change things

| Change                          | Edit                                                                 |
| ------------------------------- | -------------------------------------------------------------------- |
| Rename roles or the domain      | `src/lib/types.ts`, seed data in `src/lib/db.ts`, prompts in `src/lib/agents/` |
| Add a specialist                | New file in `src/lib/agents/`, then a node, an edge and a route in `graph.ts` |
| Who sees what                   | `getState(role)` in `src/lib/db.ts`                                  |
| Model                           | `AGENT_MODEL` env, or `src/lib/ai.ts`                                |
| Swap the database               | `src/lib/db.ts` is the only file that touches SQLite                 |
| Styling                         | CSS variables in `src/app/globals.css`                               |

### Other paths

| Path                                   | What                                                    |
| -------------------------------------- | ------------------------------------------------------- |
| `src/app/{member,overseer}/page.tsx`   | The two views                                           |
| `src/app/api/{agent,state,tasks,notes}/` | Route handlers; `agent` runs the graph                |
| `src/components/`                      | `chat-panel`, `task-list`, `notes-panel`                |
| `src/lib/use-app-state.ts`             | Polls state every 4 seconds so each view sees the other's changes |

### Invariants to keep

- Specialists that act write their own reply from what happened in the database. The concern agent uses fixed wording per severity; do not let the model phrase a safety message.
- Threads are per role. The overseer reads the member's conversation; the member's prompts never include the overseer's.
- `db.ts` opens the database lazily. Opening it at import breaks `next build` ("database is locked").
- Messages are logged after the graph succeeds, so a failed call leaves no orphan.

Env: `OPENAI_API_KEY`, `AGENT_MODEL` (optional). `pnpm db:reset` clears
`data/`. The state and task routes and all three pages were run; the agent
graph has not been tested against a live model.

---

## live-game

**ID:** `live-game` · **Package:** `live-game-template`
**What:** A host-driven live quiz on [PartyKit](https://partykit.io). One
screen runs the game; everyone else answers on their own device and scores
update in real time.
**Stack:** PartyKit · partysocket · Next.js · Tailwind 3

**Choose when:** the project is real-time and multiplayer (quizzes, polls,
lobbies, anything with rooms and a host).
**Skip when:** state must outlive the room. It is in memory, so if every
connection drops and PartyKit evicts the room, the game is gone.

Two processes, one command: `pnpm dev` runs `next dev` (3000) and
`partykit dev` (1999) together. `pnpm dev:web` and `pnpm dev:party` run them
separately; `pnpm deploy:party` deploys the room server.

### Game flow

```
lobby -start-> question -(all answered | timer | host reveal)-> reveal -next-> question ... -> ended -restart-> lobby
```

### Where to change things

| Change                        | Edit                                                              |
| ----------------------------- | ----------------------------------------------------------------- |
| Questions and timings         | `src/shared/questions.ts`                                         |
| Scoring                       | `POINTS_BASE`, `POINTS_SPEED` and `closeQuestion` in `party/index.ts` |
| Add a message or phase        | `src/shared/protocol.ts`, handle it in `party/index.ts`, add a view |
| Free-text answers             | Make `answer` a string in the protocol; compare in `closeQuestion` |
| PartyKit host                 | `NEXT_PUBLIC_PARTYKIT_HOST` (default `127.0.0.1:1999`)            |
| Styling                       | CSS variables in `src/app/globals.css`                            |

### Structure

| Path                        | What                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `party/index.ts`            | The room: phases, scoring, host rules. One instance per room code    |
| `src/shared/protocol.ts`    | Message types and `parseClientMessage`, imported by server and client |
| `src/components/game.tsx`   | Socket, rejoin on reconnect, countdown; switches on the phase        |
| `src/components/*-view.tsx` | One screen per phase (lobby, question, reveal, ended)                |
| `src/app/play/[room]/`      | The game route; `?host=1` or `?name=` seed the display name          |

### Invariants to keep

- Clients send intents; the server sends state. Never trust a role or score from a client message.
- The first connection to an empty room is the host, decided from the connection id.
- While a question is open the state carries no `answer` or `explanation`. Keep it that way when adding fields.
- Each client gets its own snapshot (`you`); other players only show `answered`.
- The client id lives in `sessionStorage`: a reload keeps your seat, a second tab is a second player.

First to connect hosts, so add a host secret if rooms are public. The server
was played end to end with scripted sockets and the screens were clicked
through from lobby to reveal; the final results screen was not.

---

## saas-starter

**ID:** `saas-starter` · **Package:** `saas-starter-template`
**What:** The plumbing a product needs before its first feature: sign-in, a
Postgres database, a one-off Stripe payment that unlocks content, rate limiting,
security headers and validated config. The example is a **project** with a
public summary and private notes; share the link, and anyone who pays can read
the notes.
**Stack:** Next.js · NextAuth v4 · Prisma 6 + Postgres · Stripe · Upstash (optional) · zod · Tailwind 3

**Choose when:** the product has users, owned data, and something to charge for.
**Skip when:** you need subscriptions or teams out of the box (the one-off
payment is the only flow; see the README's "Make it yours"), or you have no
database to run.

### Where to change things

| Change                           | Edit                                                                        |
| -------------------------------- | --------------------------------------------------------------------------- |
| Rename `Project` to your noun    | `prisma/schema.prisma`, then `pnpm db:migrate`; `src/app/api/projects`, `src/app/projects` |
| What is gated, and who may see it | `checkAccess` in `src/lib/access.ts` and `src/app/p/[slug]/page.tsx`       |
| Sign-in providers                | `src/lib/auth.ts` and the schema in `src/lib/env.ts`                        |
| Rate limits                      | `src/lib/rate-limit.ts` (named limiters; Upstash when configured)           |
| Security headers and CSP         | `src/proxy.ts`                                                              |
| Required and optional env vars   | `src/lib/env.ts`, mirrored in `.env.example`                                |

### Structure and routes

| Path                                  | What                                                              |
| ------------------------------------- | ----------------------------------------------------------------- |
| `src/app/api/projects/`               | Owner CRUD, validated, per-user rate limits                       |
| `src/app/api/share/[slug]/unlock/`    | Starts or resumes a Stripe Checkout session                       |
| `src/app/api/webhooks/stripe/`        | The only place an unlock becomes `paid`                           |
| `src/app/p/[slug]/`                   | Public share page; notes are sent only to someone who passes `checkAccess` |
| `src/app/api/health/`                 | Uptime check that also pings the database                         |
| `src/lib/url-security.ts`             | Use before the server fetches any user-supplied URL               |

### Invariants to keep

- Payment is granted by the webhook, never by the success redirect. The handler checks the signature on the raw body, ignores `unpaid` sessions, and is idempotent.
- Every gated read goes through `checkAccess`. The notes are not in the HTML for anyone who has not passed it.
- A non-owner gets the same 404 as a missing id, so ids cannot be probed.
- Users are created by the app: both sign-in paths upsert the `User` row (JWT sessions, no adapter).
- Env is validated on first use, not on import, so `next build` needs no secrets.
- The Next.js `middleware` file is called `proxy` here (`src/proxy.ts`); check `node_modules/next/dist/docs/` before relying on older conventions.

Setup: needs a Postgres `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`; copy
`.env.example` to **`.env`** (Prisma does not read `.env.local`), then `pnpm
db:deploy`. With no OAuth keys, a **passwordless demo sign-in** is on (anyone can
sign in as any email): turn real providers on and leave `ALLOW_DEMO_LOGIN` unset
before any real data. Payments stay off until `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` and `STRIPE_PRICE_ID` are set. Flows were tested against
a real Postgres (sign-in, ownership, locked and unlocked views, signed
webhooks); creating a real Checkout session was not.

---

## mcp-council

**ID:** `mcp-council`
**What:** An [MCP](https://modelcontextprotocol.io) server that makes an agent's
plan survive structured disagreement before it acts. A client (Claude Code,
Cursor, your own agent) calls `council_plan`; a council of AI members critiques
a naive plan in isolation, debates if they disagree, and votes; the client gets
one synthesized plan with the verdict and any dissent.
**Stack:** TypeScript (ESM) · `@modelcontextprotocol/sdk` · `@anthropic-ai/sdk` · zod 4 · `node:test`

**Choose when:** an agent's plan is costly to get wrong and a stress test is
worth a few minutes and about ten model calls.
**Skip when:** the step is routine. It is slow by design, and four calls to one
model share its blind spots: the verdict is a stress test, not proof.

### Tools

| Tool               | What                                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| `council_plan`     | Deliberate on `prompt` (+ optional `context`); returns verdict, votes, dissent, plan |
| `council_members`  | The roster: record, defections, score, lineage                                |
| `council_history`  | Recent decisions and vote breakdowns                                          |
| `council_override` | Say a verdict was wrong; matching members get credit                          |

### Where to change things

| Change                        | Edit                                                                    |
| ----------------------------- | ----------------------------------------------------------------------- |
| Who is on the council         | `COUNCIL_MEMBERS_FILE=./examples/members.json` (2 to 8 members, unique names; `naive` is reserved) |
| Model and depth               | `COUNCIL_MODEL` (default `claude-opus-5-5`), `COUNCIL_EFFORT` (default `medium`) |
| Turn off the reaper           | `COUNCIL_REAP_EVERY=0`; run without saving: `COUNCIL_STATE_DIR=none`    |
| The phases                    | `src/council.ts` (`deliberate`)                                         |
| The model provider            | Implement the two-method `Llm` interface in `src/llm.ts`                |
| A UI                          | `state.onEvent(...)` emits every phase, position, vote, verdict, reaper |

Add it to a client with `examples/claude-code.mcp.json` or
`examples/cursor.mcp.json` (set `cwd` and the API key).

### Invariants to keep

- stdout is the protocol. `console.log` is redirected to stderr at startup; log with `log()` from `src/log.ts`.
- Round 1 is isolated: no call contains another member's output (a test pins this).
- The debate is skipped only if every member votes `naive`.
- Member replies are schema-validated (structured outputs), and defection is computed from the two votes, never self-reported.
- Deliberations run one at a time (a queue in `src/index.ts`); the state they share is saved to `.council/state.json`.

`pnpm test` runs 30 tests offline against a stub model, including a real stdio
process. **The Claude calls in `src/llm.ts` typecheck against the SDK but have
not been exercised without a key;** run one `council_plan` to confirm. There is
no research step: members work from the prompt, the optional `context`, and what
they know.

---

## map-sim

**ID:** `map-sim` · **Package:** `map-sim-template`
**What:** A what-if simulator for a network on a map. Click to place a new node
on an existing route, choose which routes it joins, and see every node's change
in mean journey time as a colour scale over surrounding areas. Scenarios can be
saved and compared. The demo is the London Underground; the engine is generic.
**Stack:** Vite · React 19 · MapLibre GL (no token) · Zustand · Tailwind 3 · `node:test`

**Choose when:** the question is "what happens to travel or access if we add
this?" on a transport, utility or logistics network.
**Skip when:** you need routing on real road geometry or timetables (it models
a node-and-edge graph with fixed times), or a network of tens of thousands of
nodes (all-pairs Dijkstra runs per scenario).

### Where to change things

| Change                           | Edit                                                                     |
| -------------------------------- | ------------------------------------------------------------------------ |
| Dataset, labels, speeds, colours | `public/data/{nodes,edges,areas}.csv` and `src/config.ts`                |
| Basemap tiles                    | `SCENARIO.map.tiles`; OSM's public servers are for light use only        |
| The model                        | `src/engine/` (pure TypeScript, no React or map)                         |
| Map layers                       | `src/map/` (`sources.ts` builds the GeoJSON, `MapView.tsx` the layers)   |
| Placement flow and scenarios     | `src/store/useStore.ts`                                                  |

CSV columns: `nodes` `id,name,lat,lon,routes` (routes joined by `|`); `edges`
`from_id,to_id,route,distance_km`; `areas` `id,name,lat,lon,weight` (weight
optional). A route named by `travel.transferRoute` is a fixed-time walking link.

### Invariants to keep

- The new node is not a destination. Baseline and modified means average over the same baseline node set, so a node on a single line gives exactly zero change (a test pins this).
- Deltas are modified minus baseline: **negative is faster**.
- Projection is done in local metres, not degrees, so `t` is a true fraction of the edge.
- Saved scenarios store position and each edge's `t`; results are recomputed on load, so `localStorage` stays small and numbers reproduce exactly.

Known limits: a new node is a free interchange (flattering); "area" impact is the
nearest node's, and `weight` is 1 everywhere in the demo, so the weighted figure
equals the plain average until you supply weights; areas are points, not
polygons. `pnpm test` (23 tests) runs the engine on the real data; the full
browser flow was driven end to end.

---

## claims-ledger

**ID:** `claims-ledger`
**What:** A pipeline that watches what organizations say about themselves, checks
each quote word for word against the live page, tests it against measured
records, and keeps a public record of what appeared, changed or disappeared. It
runs on a schedule and its git history is the log. The demo watches two invented
companies from local pages, so it runs offline.
**Stack:** Python 3.10+ (standard library only) · a static HTML viewer · GitHub Actions

**Choose when:** the product is accountability or monitoring: claims, policies,
prices or terms that change, where "what did they say, and when?" matters.
**Skip when:** the sources need a JavaScript-rendered page or login, or you need
a model to read meaning (there is no model in the loop, on purpose).

### Pipeline

`python -m ledger all`, or one step at a time: `refresh` (fetch, diff, snapshot) →
`verify` (verbatim check) → `score` (named features and a record check) →
`bundle` (writes `site/data.js`). `python -m unittest` runs 26 tests offline.

| Path                          | What                                                              |
| ----------------------------- | ----------------------------------------------------------------- |
| `data/sources.json`           | Pages to watch, claim rules (regular expressions), claim types    |
| `data/candidates.json`        | Quotes picked by hand; they get the same verbatim check           |
| `data/scoring.json`           | Features and weights (must sum to 1.0 or less)                    |
| `data/records.json`           | Measured records claims are tested against (the demo's are invented) |
| `ledger/checks.py`            | The tests against records: where your domain goes                 |
| `data/out/`, `site/data.js`   | Generated; committed on purpose, as the record                    |
| `.github/workflows/refresh.yml` | Six-hourly run that commits only on change; must sit at the repo root to run |

### Invariants to keep

- No model is in the loop: quotes are cut from the page by code and scores are computed.
- A quote is kept only if it is a word-for-word substring of the live page (typography and whitespace folded); the rest go to `dropped.json` with a reason.
- "Can't be checked" is a result, with what record would be needed.
- A blocked or nearly empty page is skipped, never read as "the claims were removed".
- No committed file carries a run timestamp, so a second run with nothing new changes no file (a test pins this) and the scheduled job commits only real changes.

A page path that is not `http(s)://` is read as a local file, which keeps the demo
and tests offline. Set `LEDGER_CONTACT` for fetches. Live-network fetching and the
workflow were not run here.

---

## evolve-harness

**ID:** `evolve-harness`
**What:** Tune anything with parameters by evolving it: mutate a population, test
every candidate against a zoo of opponents, keep the candidates nothing else
beats on every objective (the Pareto frontier), breed the next generation. It
runs unattended, resumes after a crash, and writes a report per generation. The
demo tunes a bidder in a repeated auction.
**Stack:** Python 3.10+ (standard library only)

**Choose when:** you have a bot, strategy or configuration with a bounded set of
numeric knobs and a way to score it against opponents or scenarios.
**Skip when:** you need to evolve structure or logic rather than settings, or one
evaluation is too slow to run population x opponents x seeds times per generation.

### Use

`python -m evolve run --problem examples.auction --generations 20`; `show` prints
the champion; rerunning resumes (`--fresh` starts over). `python -m unittest`
runs 29 tests. Your problem is one file with `space`, `objectives` (exactly one
`primary`), `seed_genome()` and `evaluate(genome, seeds)`; copy `examples/auction.py`.

| Path                 | What                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `evolve/space.py`    | `Gene`, `Space`: bounds, sampling, mutation, crossover            |
| `evolve/fitness.py`  | `Objective`, `Fitness`, `dominates`, `pareto_frontier`            |
| `evolve/loop.py`     | `Evolver`: generation cycle, archive, resume, champion check      |
| `archive/` (generated) | `gen_NNNN/{results.json,REPORT.md}` and `state.json`; gitignored |

### Invariants to keep

- Fitness is a vector; a candidate survives if nothing beats it on every axis.
- Training seeds are fresh each generation, but a champion is chosen only by re-scoring on held-out seeds, so a lucky draw cannot win.
- All randomness in generation g comes from `Random(seed, g)` and state is saved atomically each generation, so a stopped-and-resumed run equals an uninterrupted one (a test pins this).
- A candidate that raises, returns a non-finite number or omits an objective is recorded as an error and never reaches the frontier; the run continues.

The search space is a flat set of bounded numbers, and results are only as good
as the opponent zoo. The demo is a toy; plugging in a heavy `evaluate` (a game
server, a subprocess) is yours to verify: give it a timeout.

---

## agent-skills

**ID:** `agent-skills`
**What:** One store of agent skills, symlinked into every coding agent's
skills directory (Claude Code, Codex, Cursor, Copilot, Gemini CLI, Kiro,
Cline, OpenCode, Windsurf, Devin). Not an app: no `package.json`, no dev
server.

**Choose when:** the team wants the same skills available in every coding
agent, for example one skill per sponsor API.

| Path                   | What                                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| `skills/<name>/SKILL.md` | Every skill. Empty by default (`.gitkeep`).                             |
| `templates/SKILL.md`   | Starting point for a new skill; not linked anywhere                       |
| `setup.sh`             | Links each skill into each harness's skills dir. Idempotent.              |
| `sync.sh`              | `git pull --ff-only`, then `setup.sh`                                     |
| `.skill-lock.json`     | skills.sh lock file; keep it in the repo                                  |

Write a skill: `cp -r templates skills/my-skill`, edit `SKILL.md`, run
`./setup.sh`. The frontmatter `description` is the only line an agent reads
when deciding whether to load the skill, so state the trigger in it.
`setup.sh` writes into `$HOME`; test with `HOME=$(mktemp -d) ./setup.sh`.

This folder is meant to become its own git repo (`sync.sh` pulls from it).

---

## Combining components

| Goal                                     | How                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Event site with an embedded assistant    | Take `frontend`, copy `chatbot`'s `src/components/` chat pieces and `src/lib/providers/`, or proxy to an `agent-app` agent |
| Chat UI over a research pipeline         | Use `research-agent` routes as the backend; reuse `chatbot` message and markdown components |
| Agent with durable state plus a report   | Keep `agent-app`; port `research-agent/src/lib/research/` stages into a Flue tool or subagent |
| Supervised agent with live multiplayer   | Keep `companion-dashboard` for the agent and views; take `live-game`'s `party/` and `src/shared/` for the room, and push room events to the overseer instead of polling |
| Quiz that generates its own questions    | Keep `live-game`; call `agent-app` or a `research-agent` stage to fill `src/shared/questions.ts` before the room starts |
| A product where paying unlocks a report  | Keep `saas-starter`; call `research-agent`'s `executeRun` from its unlock route or webhook, and gate the report with `checkAccess` |
| An agent that stress-tests its own plans | Add `mcp-council` to the client of an `agent-app` or Claude Code setup (`examples/*.mcp.json`) and call `council_plan` before large changes |
| An evolved agent                         | Use `evolve-harness` to tune the numeric settings of an `agent-app` or `mcp-council` member: put the run in `evaluate()` and score with an eval set |
| A map of what organizations claim        | Feed `claims-ledger`'s `site/data.js` into `map-sim`'s layers, or show its receipts in a `saas-starter` page |

Reusable pieces recur by name across templates, but each folder has its own
copy and they may differ: `markdown.tsx`, `composer.tsx`, `message.tsx`,
`sidebar.tsx`, `utils.ts` (`cn` helper), and Tailwind HSL tokens in
`globals.css`. When merging, copy the file and re-check imports instead of
assuming it is identical.

## Conventions for agents editing this repo

- Work inside one template folder unless the task says to combine. Run its commands from that folder.
- Install per folder: `pnpm install`. `agent-app` has two installs (`agent/`, `web/`).
- Before finishing a change, run `pnpm typecheck` and `pnpm lint` in the folder you touched (`agent-app/agent` has `typecheck` only).
- Do not commit `.env`, `.env.local`, `.next/`, `.partykit/`, `dist/`, `agent/data/` or `companion-dashboard/data/`. Only `.env.example` is tracked.
- In `companion-dashboard`, `live-game` and `saas-starter` the `~/` import alias maps to `src/`; `live-game/party/` uses relative imports because PartyKit bundles it separately. `map-sim` also uses `~/`, but its tests import with relative paths.
- Tests: `map-sim` and `mcp-council` use `pnpm test` (`tsx --test`); `claims-ledger` and `evolve-harness` use `python -m unittest` from their folder. `saas-starter` has no test suite; `pnpm ci` runs lint, typecheck and build.
- `saas-starter` reads **`.env`** (Prisma does not read `.env.local`) and needs a Postgres `DATABASE_URL`; `mcp-council` needs `ANTHROPIC_API_KEY`. Never commit either.
- Generated output to leave out of commits: `mcp-council/.council/` and `dist/`, `evolve-harness/archive/`. `claims-ledger/data/out/` and `site/data.js` are the opposite: they are the record, and the scheduled job commits them.
- Fill in `agent-app/docs/spec.md` and `demo.md` if the project is built on `agent-app`.
- Template folders are placeholders: replace names, copy and logos (`frontend` logo mark, `APP` constants in `chatbot` and `agent-app/web`) rather than shipping them.
