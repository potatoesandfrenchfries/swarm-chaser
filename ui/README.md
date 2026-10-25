# claim-spread UI

The **Demo** opens as the original large, animated agent chat. **Show graph** adds a network alongside the conversation without restarting it. The optional graph uses the same avatars, cards and controls as the rest of the app. React Flow provides pan, zoom, fit, node dragging and keyboard navigation, constrained to the team's layout: sandbox left, agents central, Chaser below, honeypot right.

The dashboard offers run setup, an overview and each run's **Chat / Log / Graph** tabs. The Graph tab opens the same React Flow graph beside the original chat. Data explorer opens the Neo4j property graph, using the bundle when the database is offline.

The bundled data is a **made-up example**, written by hand. See `DEMO.md` for the walkthrough, `ARCHITECTURE.md` for the model and data flow, and `DESIGN.md` for the visual system.

## Run

Node 22.18+ (type stripping for the server code).

```sh
cd ui
npm install
npm run dev            # http://127.0.0.1:4318  (app + read-only API)
```

## Tests

```sh
npm run typecheck
npm test               # model unit tests (vitest)
npm run e2e            # Playwright against the dev server, using installed Google Chrome
                       # PW_CHANNEL= npm run e2e  to use Playwright's own browser instead
npm run build && npm run preview   # production build; the API runs in preview too
```

## Neo4j (optional)

The Graph view reads from Neo4j when the server has `NEO4J_URI` and `NEO4J_PASSWORD`. Otherwise it says *Neo4j offline* and draws the same records from the bundle file.

With Docker running:

```sh
npm run neo4j:start    # local Neo4j Community on 127.0.0.1:17688; writes a random password to ui/.env (git-ignored, mode 600)
npm run neo4j:load     # writes every valid bundle's graph projection (scoped :CSNode, idempotent)
npm run dev            # restart so Vite picks up ui/.env
npm run neo4j:stop
```

You can also skip the `.env` file entirely and pass the variables to both commands:

```sh
NEO4J_URI=bolt://127.0.0.1:17688 NEO4J_PASSWORD=… node server/load-neo4j.ts
NEO4J_URI=bolt://127.0.0.1:17688 NEO4J_PASSWORD=… npm run dev
```

Credentials stay on the server; the browser only ever sees the host and port.

## Recorded data

Put recorded bundles (`claim-spread/replay@1`, `provenance: "recorded"`) in the repo's git-ignored `local/replay/`, or point `REPLAY_DIR` at a folder. The server lists them next to the synthetic demo and refuses any that fail validation, giving its reasons. Village text stays out of git under the dataset's research-use terms. The mapping from pipeline outputs is in `ARCHITECTURE.md` §5.

Brand marks in `public/logos/` come from thesvg.org and only identify a recorded model's vendor, or Neo4j.
