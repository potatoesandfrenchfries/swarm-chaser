# Companion dashboard template

An agent that looks after one person, plus a dashboard for whoever looks after
them. Two views of the same data: the **member** gets a calm, large-type page
(today's list and a companion to talk to); the **overseer** gets the full
picture (concerns the agent recorded, the list, the conversation, and an
assistant that briefs them).

Distilled from a dementia-care hackathon build (patient and caretaker views over
a supervisor-routed agent graph). The medical specifics are gone; the shape fits
any "someone, and the person responsible for them" product: a student and a
teacher, a customer and a support lead, a new hire and a manager.

**Stack:** Next.js (App Router) · React 19 · TypeScript · Tailwind CSS 3 · LangGraph · Vercel AI SDK · SQLite (`node:sqlite`)

Needs **Node 22.13+** (the built-in `node:sqlite`, so there is no native module to compile).

## Run it

```bash
pnpm install
cp .env.example .env.local     # add OPENAI_API_KEY
pnpm dev                       # http://localhost:3000
```

Open `/member` and `/overseer` in two windows. Tell the companion “my head hurts”
and a concern appears on the overseer's screen within a few seconds.

| Script          | What it does                                             |
| --------------- | -------------------------------------------------------- |
| `pnpm dev`      | Dev server (creates and seeds `data/app.db` on first use) |
| `pnpm build`    | Production build                                         |
| `pnpm lint`     | ESLint                                                   |
| `pnpm typecheck`| `tsc --noEmit`                                           |
| `pnpm db:reset` | Delete the database; it is re-seeded on next start       |

## How the agent works

```
message ─► supervisor ─┬─► task     add / complete / remove / list the to-do list
                       ├─► concern  record a note for the overseer, with a severity
                       └─► chat     warm companion (member) or briefing (overseer)
```

`src/lib/agents/graph.ts` is the whole wiring. The supervisor returns a typed
route (no string parsing), and conditional edges send the message to one
specialist.

- **Specialists that act write their own reply from what happened.** The task agent says “Added X” only after inserting X; the concern agent uses fixed wording per severity, because a safety message should not depend on model phrasing.
- **One free-form agent, two personas.** `companion.ts` answers the member warmly and briefs the overseer from live data.
- **State lives in SQLite**, not the graph. `src/lib/db.ts` is the only file that touches it.
- **Threads are per role.** The overseer can read the member's conversation; the member's prompts never include the overseer's.

## Where to change things

| Want to                         | Edit                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| Rename the roles or the domain  | `src/lib/types.ts`, the seed data in `src/lib/db.ts`, prompts in `src/lib/agents/` |
| Add a specialist                | New file in `src/lib/agents/`, then a node, an edge and a route in `graph.ts` |
| Change who sees what            | `getState(role)` in `src/lib/db.ts`                        |
| Change the model                | `AGENT_MODEL` env, or `src/lib/ai.ts`                      |
| Restyle                         | CSS variables in `src/app/globals.css`                     |

## Things to know

- **No auth.** The role is a URL (`/member`, `/overseer`) and a field the API trusts. Put real sign-in in front of it before it holds anyone's real data.
- **Single member.** `MEMBER_ID = 1` in `db.ts`. Multi-member means a `member_id` column on each table and a route param.
- **Polling, not push.** Views refresh every 4 seconds (`src/lib/use-app-state.ts`). Swap in SSE if you need it instant.
- **Not tested against a live model here.** Typecheck, lint, build and the non-LLM routes (state, tasks) were run; the agent graph needs your `OPENAI_API_KEY`.
- **This is a hackathon pattern, not a medical device.** The concern agent surfaces what a person said; it does not diagnose, and its “call emergency services” line is not a substitute for real escalation.
