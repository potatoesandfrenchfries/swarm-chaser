# Map sim template

A what-if simulator for a network on a map. Click to place a new node on an
existing route, choose which routes it joins, and see who gets faster and who
gets slower: every node's change in mean journey time, as a colour scale over
the surrounding areas, with scenarios you can save and compare.

Distilled from an Olympic Way Interchange proposal that won the LSESU x
Susquehanna Datathon 2026 (a new London Underground station). The demo data is
the London network; the engine knows nothing about London.

**Stack:** Vite · React 19 · TypeScript · Tailwind CSS 3 · MapLibre GL (no token needed) · Zustand · `node:test`

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm test           # the engine, on the real data: no browser, no keys
```

Click **Add station**, then click the map near a line. Pick which lines the new
station joins and press **Compute impact**. A station on one line changes
nothing; the benefit comes from joining two or more lines.

| Script           | What it does                              |
| ---------------- | ----------------------------------------- |
| `pnpm dev`       | Dev server                                |
| `pnpm build`     | Production build to `dist/`               |
| `pnpm test`      | 23 engine tests, including the real data  |
| `pnpm lint`      | ESLint                                    |
| `pnpm typecheck` | `tsc -b --noEmit`                         |

## How it works

| Path                      | What                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `src/config.ts`           | Everything scenario-specific: labels, map start, travel speeds, route colours, data paths |
| `public/data/*.csv`       | `nodes.csv`, `edges.csv`, `areas.csv`: the whole dataset                              |
| `src/engine/`             | Pure TypeScript: graph, Dijkstra, geometry, impact. No React, no map                  |
| `src/data/load.ts`        | CSV parsing (separate from fetching, so tests run it on the real files)               |
| `src/store/useStore.ts`   | Zustand store: placement flow, results, saved scenarios                               |
| `src/map/`                | MapLibre layers and the GeoJSON built for them                                        |
| `src/components/`         | Toolbar, connect panel, results, scenario list and comparison                         |

The model, in four steps:

1. **Graph.** Nodes are stations, edges are the links between them, weighted by travel time (`distance / speed + dwell`; transfers have a fixed time).
2. **Insert.** A new node splits each chosen edge in two, with times proportional to where it lands. On its own that changes nothing; joining several routes at one node is what creates shortcuts.
3. **Compare.** Dijkstra from every node gives its mean journey time to every other node, before and after. The change per node is `after - before`, so **negative is faster**.
4. **Spread.** Each area takes the change of the node nearest to it. Areas can carry a `weight` (population, deprivation, demand) that drives the weighted average.

## Use your own network

Replace the three CSVs and edit `src/config.ts`; nothing else assumes London.

| File        | Columns                                                          |
| ----------- | ---------------------------------------------------------------- |
| `nodes.csv` | `id,name,lat,lon,routes` (`routes` separated by `\|`)            |
| `edges.csv` | `from_id,to_id,route,distance_km` (every id must be in nodes)    |
| `areas.csv` | `id,name,lat,lon,weight` (`weight` optional, defaults to 1)      |

A route called `interchange` (set `travel.transferRoute`) is treated as a
fixed-time walking link. Set `kmPerMin` and `dwellMin` to suit your mode of
transport, and `ROUTE_COLOURS` for your routes.

## Decisions worth keeping

- **The new node is not counted as a destination.** The naive version averages over the baseline nodes plus the new one, which shifts every mean even if no journey got faster: a node dropped on a single line would show "improvements" everywhere. Both sides here average over the same baseline set, and a test pins that a single-line node gives exactly zero change.
- **Projection uses true distance.** `t` (where along the edge the node sits) is computed in local metres. In raw degrees it is skewed away from the equator, and the saved split times would be wrong.
- **Scenarios store where, not what.** A saved scenario is the node's position and each edge's `t`; results are recomputed on load. That keeps `localStorage` small (a 5,000-area result would otherwise fill it) and reloads reproduce the saved numbers exactly.
- **No token.** MapLibre with a raster basemap needs no account. Swap `SCENARIO.map.tiles` for your own tile provider before putting it online: OSM's public tile servers are for light use.

## Things to know

- **A new node is a free interchange.** Routes that meet at it have zero transfer time, which flatters the result. Model a transfer penalty if the answer matters.
- **"Area" impact is the nearest node's impact.** There is no population or deprivation weighting in the demo data (`weight` is 1 everywhere), so the "weighted" figure equals the plain average until you supply weights. The winning proposal's equity scoring lived in a separate notebook and is not part of this code.
- **Areas are points, not polygons.** The demo ships 5,244 area centroids instead of the 3 MB boundary file; to draw polygons, swap the `areas` source and layer in `src/map/`.
- **It scales to a few thousand nodes.** All-pairs Dijkstra runs per scenario (about 50 ms for 358 nodes). For a much larger network, restrict sources to a sample or precompute.
- **Tested:** the engine (graph surgery, Dijkstra, projection, the zero-change case, the real London data) and the full browser flow (place, connect, compute, save, reload, replay, delete). The area colours were checked by eye on one scenario, not asserted.
