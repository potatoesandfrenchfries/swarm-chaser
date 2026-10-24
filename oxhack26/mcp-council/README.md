# MCP council template

An [MCP](https://modelcontextprotocol.io) server that makes an agent's plan
survive structured disagreement before it acts. Any MCP client (Claude Code,
Cursor, your own agent) calls `council_plan` with a task; a council of AI
members with different engineering outlooks critiques a naive plan, debates, and
votes; the client gets back one synthesized plan with the verdict and any dissent.

Distilled from "Amogus", a Cursor Hack London entry (Agent Runtime Tools track).
The visualization (an Among Us themed meeting room), the websocket server and the
fake "web research" step are gone; the deliberation engine is kept, tightened, and
tested offline.

**Stack:** TypeScript (ESM) · `@modelcontextprotocol/sdk` · `@anthropic-ai/sdk` · zod · `node:test`

## Why a council

Ask one agent for a plan and you get one unchallenged perspective. Ask four for
theirs and, if each sees the others, they converge: the likeliest reply to
someone else's reasoning is "I agree because...". The council prevents that
structurally:

```
naive plan ─► Round 1: members work in isolation, in parallel
              (no call contains another member's output)
           ─► Round 2: only if anyone wants a change. They read each other,
              challenge one member, and cast a final vote
           ─► Verdict: votes weighted by confidence x track record
           ─► Clerk: a neutral synthesizer writes the plan, keeping the dissent
```

## Run it

Needs Node 20+ and an Anthropic API key.

```bash
pnpm install
cp .env.example .env              # or export ANTHROPIC_API_KEY
pnpm test                         # offline: no key needed
```

Add it to your client (see `examples/`): Claude Code reads `.mcp.json` in a
project, Cursor reads `.cursor/mcp.json`. Then ask: *"Use council_plan to plan:
build a collaborative whiteboard."*

| Command          | What it does                                  |
| ---------------- | --------------------------------------------- |
| `pnpm dev`       | Run the server with reload (stdio)            |
| `pnpm build`     | Compile to `dist/` (the `mcp-council` bin)    |
| `pnpm test`      | 30 tests, all offline (a stub replaces Claude) |
| `pnpm typecheck` | `tsc --noEmit`                                |

A deliberation makes about 10 model calls and takes a few minutes. Reserve it
for decisions that are costly to get wrong. Long calls can hit a client's tool
timeout; the server sends MCP progress notifications, which some clients use to
keep waiting.

## Tools

| Tool               | What it does                                                                         |
| ------------------ | ------------------------------------------------------------------------------------ |
| `council_plan`     | Deliberate on `prompt` (+ optional `context`). Returns verdict, votes, dissent, plan |
| `council_members`  | The roster: record, defections, score, lineage                                       |
| `council_history`  | Recent decisions and their vote breakdowns                                           |
| `council_override` | Say a past verdict was wrong. Members who backed the right option get credit         |

## How it works

| File               | What                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `src/council.ts`   | `deliberate()`: the phases, `computeVerdict()`, stat updates, the Clerk                       |
| `src/members.ts`   | The four default members, prompts, roster loading, and the replacement a reaper spawns        |
| `src/schemas.ts`   | zod schemas for what each member must reply, and the record types                             |
| `src/llm.ts`       | The only file that talks to Claude: an `Llm` interface plus the Anthropic implementation      |
| `src/state.ts`     | Roster, records and history, saved to `.council/state.json`; an event hook for progress       |
| `src/reaper.ts`    | Every N decisions, replaces a member whose score is below 0.3                                 |
| `src/index.ts`     | The MCP server: tool definitions, one-at-a-time queue, progress notifications                 |

Choices worth keeping when you adapt it:

- **Replies are schema-validated, not regex-parsed.** Each member's reply goes through structured outputs with a zod schema, so a malformed answer fails loudly instead of becoming an empty vote. Round 2 votes are constrained to `naive` or a real member's name.
- **Defection is computed, not reported.** A member defects if their final vote differs from their round 1 vote. The model is never asked to self-report it.
- **The debate is skipped only when everyone votes `naive`.** If every member backs their own plan, the plans differ, which is exactly when a debate is needed.
- **A record can discount a member but not silence one.** Vote weight is `confidence x (0.5 + 0.5 x record)`, so it stays between half and all of the member's confidence.
- **The LLM sits behind an interface.** `Llm` has two methods, so the whole engine runs in tests with a stub: isolation, verdict math, defection, the reaper and persistence are all tested without an API key.
- **State is saved.** History, records and the id counter survive a restart, so the track record that weights votes does not reset every chat.
- **stdout is the protocol.** `console.log` is redirected to stderr at startup; everything is logged to stderr.

## Make it yours

| Want to                              | Edit                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| Change who is on the council         | `COUNCIL_MEMBERS_FILE=./examples/members.json` (2 to 8 members, unique names; see the example) |
| Change the model or depth            | `COUNCIL_MODEL`, `COUNCIL_EFFORT` (low to max; default `medium`)                      |
| Turn off the reaper                  | `COUNCIL_REAP_EVERY=0`                                                                |
| Run without saving                   | `COUNCIL_STATE_DIR=none`                                                              |
| Give members real research           | Pass findings in `context`, or add a recon step in `deliberate()` before the naive plan |
| Add a UI                             | `state.onEvent(...)` emits every phase, position, vote, verdict and reaper event      |
| Use another provider                 | Implement `Llm` (`object` and `text`) in `src/llm.ts`                                 |

## Things to know

- **No research step.** The original's "recon" asked Claude to recall facts and called it web search. This version does not pretend: members work from the prompt, the optional `context`, and what they know. SCOUT is told to say when it is recalling from memory.
- **Not yet run against the live API.** The engine, the MCP layer and a real stdio process are tested; the Claude calls in `src/llm.ts` typecheck against the SDK but were not exercised without a key. Run one `council_plan` to confirm before relying on it.
- **Refusals fall back by default.** Calls opt into the API's server-side fallback (beta `server-side-fallback-2026-07-01`) so a safety classifier declining a request retries on another model instead of failing. Remove `betas` and `fallbacks` in `llm.ts` if your key or platform does not support it.
- **The council can be wrong, and agreeing is not evidence.** Four calls to one model share its blind spots. Diversity here is in prompts and isolation, not in knowledge. Treat the verdict as a stress test of a plan, not as proof.
