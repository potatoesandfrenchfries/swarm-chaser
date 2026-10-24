# Research agent template

Staged research runs that end in a cited report. A LangGraph pipeline plans
queries, searches the web and your uploaded documents, drafts findings that must
cite evidence, has a second pass verify each claim, and writes a report from the
verified claims only.

Distilled from a GTM research workstation. The domain code (source scoring,
competitor matrices, section policies) is gone; the architecture is kept.

**Stack:** Next.js (App Router) · React 19 · TypeScript · Tailwind CSS 3 · LangGraph · Vercel AI SDK · Supabase (Postgres + pgvector) · Tavily

## Run it

1. Create a Supabase project. In the SQL editor run the two files in `supabase/migrations/`, in order.
2. Fill in the keys:

```bash
pnpm install
cp .env.example .env.local     # Supabase URL + service-role key, OpenAI key, Tavily key (optional)
pnpm dev                       # http://localhost:3000
```

Upload a file on **Documents**, then start a run on **Runs**. Without a Tavily
key the web stage is skipped and the run uses only the documents you link.

| Script           | What it does   |
| ---------------- | -------------- |
| `pnpm dev`       | Dev server     |
| `pnpm build`     | Production build |
| `pnpm lint`      | ESLint         |
| `pnpm typecheck` | `tsc --noEmit` |

## How a run works

```
plan → web_search → document_retrieval → draft → verify → finalize
```

| Stage                | File                                  | What it does                                                         |
| -------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `plan`               | `lib/research/nodes/plan.ts`          | LLM writes 3 to 5 search queries                                     |
| `web_search`         | `nodes/web-search.ts`                 | Tavily per query; results become evidence rows                       |
| `document_retrieval` | `nodes/document-retrieval.ts`         | Embeds topic + queries, pgvector search over the linked documents    |
| `draft`              | `nodes/draft.ts`                      | LLM writes findings citing evidence labels (`E1`, `E2`); uncited findings are dropped |
| `verify`             | `nodes/verify.ts`                     | One call per claim, shown only its cited excerpts: supported / partial / unsupported |
| `finalize`           | `nodes/finalize.ts`                   | Report from verified findings; unverified ones are appended under "Needs review" by code |

Three decisions worth keeping when you adapt it:

- **Evidence is one table.** Web results and document chunks are both `research_evidence` rows, so a claim cites either the same way.
- **Graph state is tiny.** Nodes read and write Supabase, not the graph state, so a crash loses nothing and the UI can poll the same tables.
- **The model never decides what ships.** Citations are checked in code, and the "Needs review" section is appended outside the LLM so an unsupported claim cannot be reworded into sounding established.

## Where to change things

| Want to                          | Edit                                                                  |
| -------------------------------- | --------------------------------------------------------------------- |
| Change the stages or their order | `lib/research/graph.ts` and `STAGES` in `schemas.ts`                  |
| Loop back when evidence is thin  | `addConditionalEdges` after `verify` in `graph.ts`                    |
| Change the model                 | `RESEARCH_MODEL` env, or `lib/research/ai.ts`                         |
| Swap the search provider         | Implement `WebSearchService` in `lib/research/search.ts`              |
| Add a file type                  | `extractText` in `lib/research/ingest.ts`                             |
| Restyle                          | CSS variables in `src/app/globals.css`                                |

## Things to know

- **The run executes inside one request** (`api/research/runs/[id]/execute`, `maxDuration = 300`). That is fine locally and for demos; move `executeRun` to a queue or worker if runs can outlast your host's limit.
- **The browser never talks to Supabase.** RLS is on with no policies, and the server uses the service-role key, so the key must stay server-side (no `NEXT_PUBLIC_` prefix).
- **Starting a run is explicit.** The form redirects to `?start=1`; a plain refresh of the run page never re-runs it. A failed run has a Retry button, which clears the old attempt first.
- **Original files are not kept.** Only text chunks and embeddings are stored. Add a Supabase Storage upload in `api/upload` if you need to show the source file.
- **Not yet run end to end here.** It typechecks, lints, builds, and the graph compiles, but it needs your own Supabase project and OpenAI key to run a real research pass.
