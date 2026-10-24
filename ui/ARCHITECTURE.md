# ARCHITECTURE: claim-spread UI

One canonical event model, one replay function, three views plus a landing page (`HomeView`, the default when the URL names no view). The replay, the comparison, the graph explorer and the Neo4j copy all read the same records; none of them has its own dataset.

```
data/synthetic/*.json ─┐                         ┌─ ReplayView (stage, caption, meter, dock, inspector)
local/replay/*.json  ──┼─ server/bundles.ts ──► /api/bundles ─► store.tsx ─► deriveState(run, cursor) ─┼─ CompareView (stage ×N, metrics)
  (git-ignored,        │   validateBundle()                     (one reducer,  pure fold               └─ ExplorerView (graph projection)
   real runs)          │                                         URL-synced)                                     ▲
                       └─ server/load-neo4j.ts ─► projectRun() ─► Neo4j ─► /api/neo4j/runs/… ──────────────────────┘
                                                  (same function the explorer uses offline)
```

## 1. Canonical model (`src/model/types.ts`)

Schema `claim-spread/replay@1`. A **bundle** holds runs. A **run** holds actors, records, claims and ordered events.

| Field | Meaning | When unknown |
| --- | --- | --- |
| `event.id` | stable id, unique in the run | required |
| `event.seq` | logical order, 0..n−1, contiguous | required |
| `event.ts` | ISO time from the source | `null` (synthetic runs have none) |
| `event.order_basis` | `logged-sequence`, `timestamp` or `tied-timestamp` (order uncertain) | required |
| `event.type` | read, delegate, claim, repeat, endorse, dispute, action, check, intervene, correct | required |
| `event.actor` / `event.target` | who does it, and to which actor or record | `target: null` for private steps |
| `event.claim` | the claim it states, carries, checks or corrects | `null` |
| `event.text` | verbatim message or tool output | `null` |
| `event.summary` | one plain sentence, written by the bundle author or a template; never presented as verbatim | required |
| `event.tool`, `event.effect` | tool call and the record state it produced, verbatim | `null` |
| `event.verdict`, `event.evidence[]` | for checks: verdict and exact quotes from records | `null`, `[]` |
| `event.causes[]` | earlier events this one depends on, where the log establishes it | `[]` |
| `event.basis` | `observed` (in the log), `inferred` (rule or linker), `derived` (model classification) | required |
| `event.source` | pointer to the source file and row | `null` |
| `run.provenance` / `bundle.provenance` | `recorded`, `live` (reserved, nothing produces it), `synthetic` | required |
| `claim.ground_truth` | `false-by-design` for planted claims, `true-by-design`, else `null` | `null` |

**Validation** (`src/model/validate.ts`) runs on the server when a bundle is listed and again in the browser before it is used. A bundle with any problem is refused with its reasons; nothing is patched. The rules:
- references resolve
- `seq` is contiguous
- causes precede their effects
- checks carry a verdict, and nothing else does
- every evidence quote is an exact substring of its record
- every claim's text is verbatim in its origin event
- a synthetic bundle cannot contain a recorded run

## 2. Replay engine (`src/model/replay.ts`)

`deriveState(run, cursor)` is a pure fold over `events[0..cursor]`; `cursor = -1` is the moment before the first event. It returns:
- each actor's claims exposed, said, acted on, corrected and checked
- each record's current state and verdicts
- each claim's status and carriers
- the edges aggregated by (from, to, channel)

The same cursor always gives the same state, whatever came before; `model.test.ts` and the e2e suite both check this.

Channels give each edge one meaning:
- `read`, `task`, `claim`, `claim-action`, `action`
- `corrective-action` (an action whose cause is a correction or intervention)
- `check`, `intervene`, `correct`, `dispute`

Exposure is not belief: a target of a claim-carrying event is *exposed*; only the speaker *said* it.

**Playback.** `store.tsx` holds one reducer: view, bundle, run, cursor, playing, speed, selection, and a `transition` stamp. Only `usePlayback` advances the cursor, with one `setTimeout` keyed on the cursor, so a pause, seek or speed change cancels the pending tick. A seek sets `transition.animate = false`; a step or playback tick sets it to true. Animation (`useTween`) is purely visual: until the pulse lands the stage shows `deriveState(cursor − 1)`, then the derived state of the cursor. Nothing reads animation progress to decide what happened.

**URL.** `?view=home|replay|compare|graph&bundle=&run=&step=&sel=kind:id` mirrors the state (no `view` means the landing page), so a link reproduces the exact frame and selection, and switching views keeps both.

## 3. Metrics (`src/model/metrics.ts`)

Counted for one claim over `events[0..upTo]`, shown in the meter (to the playhead) and in Compare (to each run's end or the replay step):

| Metric | Definition |
| --- | --- |
| Agents exposed | distinct agents (monitors excluded) who received the claim in a message or task, or read a record holding it |
| Repetitions | events passing the claim on after its first statement: repeat, endorse, or a task carrying it |
| Actions on the claim | actions with the claim set, excluding actions that follow a correction or intervention |
| Detected after | events between the first statement and the first `contradicted` check; `null` if none |
| Interventions and corrections | monitor interventions plus correct/dispute events, and the actions that directly follow them |
| Where things ended up | last `effect` written to each record, verbatim |

No percentages or rates are computed. Compare shows `runs_per_condition` and the bundle's caveats beside the numbers.

## 4. Graph projection and Neo4j (`src/model/graph.ts`, `server/neo4j.ts`)

`projectRun()` turns a run into a property graph:

```
(:Actor)-[:DID]->(:Event)-[:TO]->(:Actor)    (:Event)-[:ON]->(:Record)    (:Event)-[:ABOUT]->(:Claim)
(:Event)-[:CITES {stance, quote}]->(:Record) (:Event)-[:DEPENDS_ON]->(:Event)  (:Claim)-[:FIRST_STATED_IN]->(:Event)
```

Every node also carries `:CSNode` plus `bundle`, `run` and `provenance` properties, so loads are scoped and idempotent: a reload deletes that run's nodes, then recreates them. Labels and relationship types come only from fixed lists; values are always parameters.

- **Write path:** `npm run neo4j:load` validates each bundle and writes its projection.
- **Read path:** the API reads a run back and returns the same projection type. The explorer compares node and relationship counts with the bundle's own projection and warns on any mismatch.
- **Offline:** when Neo4j is unconfigured, unreachable or missing the run, the explorer says which, and draws `projectRun()` of the bundle under the label "Neo4j offline … same records drawn from the bundle file". It never shows a connected state it does not have.

Credentials are read only on the server (`process.env` / `ui/.env`, never `VITE_*`). The API is GET-only (POST returns 405). The browser sees host and port, never the user or password.

## 5. Data sources and provenance

| Source | Where | Provenance | State |
| --- | --- | --- | --- |
| Synthetic demonstration | `data/synthetic/merch-launch.json` | `synthetic` | Present. Hand-written, three conditions, one run each |
| Recorded village or sandbox runs | `../local/replay/*.json` (git-ignored, dataset terms) or `REPLAY_DIR` | `recorded` | **No recorded bundle exists yet.** The server lists one as soon as a file appears |
| Live | — | `live` | Not implemented; no live source exists |

Provenance is shown in the header, the Compare kicker, the inspector's run panel and every Neo4j node. If the API fails, the app shows the error and offers the synthetic demo by name; it never substitutes it silently (e2e: "when the server fails …").

**Mapping pipeline outputs to a recorded bundle** (the exporter is not written yet; this is the contract):

| Pipeline record | Bundle |
| --- | --- |
| `rows(id, episode_id, agent, model, ts, source, text, room)` | actors (name, model); a `message` record per room; `claim`/`repeat` events with `ts`, `order_basis: timestamp` (or `tied-timestamp` on equal times), `source.ref = row id` |
| `extract.claims.Claim` | `claims[]`, origin = the event for `row_id`; `text = quote` (verbatim by construction) |
| `spread.linker.SpreadEdge` | `repeat`/`endorse`/`correct`/`dispute` events by `agent` at `ts`, `basis: inferred` (linker), cause = the claim's origin |
| "could have seen" (`visible_rows`) | `read` events from the room, `basis: inferred`, never `observed` |
| `check.checker.Verdict` | a `check` event by a `checker` actor (`kind: checker`, model = judge), `basis: derived`, placed after the run's last event with a run note saying the check was post hoc |
| sandbox transcript (M9) | `observed` events from the agent loop's tool calls and messages; the planted file as a `planted: true` record |

## 6. Code map

| Concern | Path |
| --- | --- |
| Canonical model, validation, replay, metrics, projection | `src/model/` (pure TypeScript, unit-tested in `model.test.ts`) |
| Shared state, URL sync, playback timer, tweens | `src/state/` |
| Stage layout (deterministic stream layout, collision-aware record cards) | `src/lib/layout.ts` |
| Stage, dock and scrubber, caption, claim meter, inspector, glyphs | `src/components/` |
| Views | `src/views/HomeView.tsx` (landing), `ReplayView.tsx`, `CompareView.tsx`, `ExplorerView.tsx` (lazy, Cytoscape) |
| Display names | Come from the bundle (`actor.name`: Agent 1–4, Judge); actors with `kind: monitor` are shown as the Judge. Nothing in code hard-codes the synthetic names |
| API, bundle registry, Neo4j adapter and loader | `server/` (runs inside the Vite dev and preview servers) |
| End-to-end tests | `e2e/replay.spec.ts` (Playwright, installed Chrome) |

## 7. Decisions

- **Vite + React 19 + TypeScript, plain CSS tokens; no Tailwind or component kit.** The surface is one bespoke instrument; the tokens in `DESIGN.md` map straight to CSS variables.
- **Custom SVG stage, Cytoscape for the explorer.** The replay needs exact control of every path and timing. The explorer needs zoom, pan and layouts over arbitrary graphs. Cytoscape is MIT; Neo4j NVL was rejected on the `graph-test` branch for its licence.
- **API inside Vite.** One command serves the app, the API and Neo4j access, in dev and in `vite preview`. A separate backend would add a process without adding a capability.
- **Fonts self-hosted** (`@fontsource-variable/*`) and brand marks self-hosted (`public/logos`, from thesvg.org), so the demo runs without network.
- **Records are measured, not guessed, in the layout.** The overlap test uses the same card width the CSS gets (`--record-w`).
