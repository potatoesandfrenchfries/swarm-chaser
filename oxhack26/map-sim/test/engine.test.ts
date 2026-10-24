import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseAreas, parseEdges, parseNodes } from "../src/data/load.js";
import { meanTravelTimes, shortestTimes } from "../src/engine/dijkstra.js";
import { findNearbyEdges, haversineM, projectOnSegment } from "../src/engine/geometry.js";
import { buildGraph, cloneGraph, insertNode } from "../src/engine/graph.js";
import { baselineMeans, simulate, summarise } from "../src/engine/impact.js";
import type { Area, Edge, NetNode, Pick } from "../src/engine/types.js";

// A tiny city. Two routes, "red" (A-B-C) and "blue" (D-E-F), run in parallel
// 1 km apart, with no connection between them.
const node = (id: string, lat: number, lon: number): NetNode => ({ id, name: id, lat, lon, routes: [] });
const NODES = [node("A", 0, 0), node("B", 0, 0.01), node("C", 0, 0.02), node("D", 0.01, 0), node("E", 0.01, 0.01), node("F", 0.01, 0.02)];
const byId = new Map(NODES.map((n) => [n.id, n]));
const edge = (from: string, to: string, route: string, minutes = 5): Edge => {
  const a = byId.get(from)!;
  const b = byId.get(to)!;
  return { fromId: from, toId: to, route, distKm: 1, minutes, fromLat: a.lat, fromLon: a.lon, toLat: b.lat, toLon: b.lon };
};
const EDGES = [edge("A", "B", "red"), edge("B", "C", "red"), edge("D", "E", "blue"), edge("E", "F", "blue"), edge("B", "E", "link", 20)];

const area = (id: string, nearestNodeId: string, weight = 1): Area => ({ id, name: id, lat: 0, lon: 0, weight, nearestNodeId });
const AREAS = NODES.map((n) => area(`area-${n.id}`, n.id));

describe("shortestTimes", () => {
  it("finds the cheapest route, not the fewest hops", () => {
    const g = buildGraph(NODES, [edge("A", "B", "r", 1), edge("B", "C", "r", 1), edge("A", "C", "r", 10)]);
    assert.equal(shortestTimes(g, "A").get("C"), 2);
  });

  it("reports unreachable nodes as Infinity", () => {
    const g = buildGraph(NODES, [edge("A", "B", "r")]);
    assert.equal(shortestTimes(g, "A").get("F"), Infinity);
  });

  it("is symmetric: edges run both ways", () => {
    const g = buildGraph(NODES, EDGES);
    assert.equal(shortestTimes(g, "A").get("F"), shortestTimes(g, "F").get("A"));
  });
});

describe("meanTravelTimes", () => {
  it("averages over reachable nodes in the set, ignoring unreachable ones", () => {
    const g = buildGraph(NODES, [edge("A", "B", "r", 2), edge("B", "C", "r", 4)]);
    const means = meanTravelTimes(g, ["A", "B", "C", "F"]); // F is isolated
    assert.equal(means.get("A"), (2 + 6) / 2);
    assert.equal(means.get("F"), 0);
  });

  it("only counts the destinations it is given", () => {
    const g = buildGraph(NODES, [edge("A", "B", "r", 2), edge("B", "C", "r", 4)]);
    assert.equal(meanTravelTimes(g, ["A", "B"]).get("A"), 2); // C is not a destination
  });
});

describe("insertNode", () => {
  const picks = (...specs: [number, number][]): Pick[] => specs.map(([i, t]) => ({ edge: EDGES[i]!, t }));

  it("splits an edge into two halves whose times add up", () => {
    const g = buildGraph(NODES, EDGES);
    insertNode(g, "N", picks([0, 0.25])); // A-B, 5 min, split 1.25 / 3.75
    assert.equal(g.get("A")!.some((e) => e.toId === "B" && e.route === "red"), false);
    const n = g.get("N")!;
    assert.equal(n.find((e) => e.toId === "A")!.minutes, 1.25);
    assert.equal(n.find((e) => e.toId === "B")!.minutes, 3.75);
    assert.equal(shortestTimes(g, "A").get("B"), 5);
  });

  it("only removes the edge of the picked route when routes share a pair of nodes", () => {
    const parallel = [edge("A", "B", "red"), edge("A", "B", "blue")];
    const g = buildGraph(NODES, parallel);
    insertNode(g, "N", [{ edge: parallel[0]!, t: 0.5 }]);
    assert.ok(g.get("A")!.some((e) => e.toId === "B" && e.route === "blue"));
    assert.ok(!g.get("A")!.some((e) => e.toId === "B" && e.route === "red"));
  });

  it("does not mutate the graph it was cloned from", () => {
    const base = buildGraph(NODES, EDGES);
    const copy = cloneGraph(base);
    insertNode(copy, "N", picks([0, 0.5]));
    assert.equal(base.has("N"), false);
    assert.ok(base.get("A")!.some((e) => e.toId === "B"));
  });
});

describe("simulate", () => {
  const base = buildGraph(NODES, EDGES);
  const before = baselineMeans(base);

  it("a node on a single edge changes nothing: every delta is zero", () => {
    // This is the case a naive version gets wrong: the new node, counted as one
    // more destination, would shift every mean even though no trip got faster.
    const result = simulate(base, before, AREAS, [{ edge: EDGES[0]!, t: 0.5 }]);
    for (const d of result.nodeDeltas.values()) assert.ok(Math.abs(d) < 1e-9, `delta ${d}`);
    assert.equal(result.metrics.nodesBenefited, 0);
    assert.equal(result.metrics.nodesPenalised, 0);
  });

  it("joining two routes with a new interchange makes trips faster and never slower", () => {
    // Red's B-C (index 1) meets blue's E-F (index 3) at a new node: C and F become close.
    const result = simulate(base, before, AREAS, [
      { edge: EDGES[1]!, t: 1 }, // at C
      { edge: EDGES[3]!, t: 1 }, // at F
    ]);
    assert.ok(result.metrics.nodesBenefited > 0);
    assert.equal(result.metrics.nodesPenalised, 0);
    assert.ok(result.metrics.netMinutes < 0, "negative net means faster");
    assert.ok(result.metrics.maxBenefit > 0);
    for (const d of result.nodeDeltas.values()) assert.ok(d <= 1e-9);
  });

  it("carries node changes to the areas that use those nodes", () => {
    const picks: Pick[] = [{ edge: EDGES[1]!, t: 1 }, { edge: EDGES[3]!, t: 1 }];
    const result = simulate(base, before, AREAS, picks);
    for (const a of AREAS) assert.equal(result.areaDeltas.get(a.id), result.nodeDeltas.get(a.nearestNodeId));
  });

  it("does not change the baseline graph", () => {
    const snapshot = JSON.stringify([...base]);
    simulate(base, before, AREAS, [{ edge: EDGES[1]!, t: 1 }, { edge: EDGES[3]!, t: 1 }]);
    assert.equal(JSON.stringify([...base]), snapshot);
  });
});

describe("summarise", () => {
  it("counts benefits and penalties past the epsilon and weights area impact", () => {
    const nodeDeltas = new Map([["a", -2], ["b", 0.5], ["c", 0.0001]]);
    const areas = [area("x", "a", 3), area("y", "b", 1)];
    const areaDeltas = new Map([["x", -2], ["y", 0.5]]);
    const m = summarise(nodeDeltas, areaDeltas, areas);
    assert.equal(m.nodesBenefited, 1);
    assert.equal(m.nodesPenalised, 1); // 0.0001 is below epsilon: no change
    assert.equal(m.maxBenefit, 2);
    assert.equal(m.maxPenalty, 0.5);
    assert.equal(m.weightedAreaMinutes, (-2 * 3 + 0.5 * 1) / 4);
    assert.equal(m.areasBenefited, 1);
  });
});

describe("geometry", () => {
  it("projects onto a segment in true distance, not degrees", () => {
    // At 60 degrees north a degree of longitude is half as long as one of latitude.
    // Point 0.001 deg east of the midpoint of a north-south segment: t must stay 0.5.
    const { t, distM } = projectOnSegment(60, 10.001, 59.99, 10, 60.01, 10);
    assert.ok(Math.abs(t - 0.5) < 1e-6);
    assert.ok(Math.abs(distM - haversineM(60, 10.001, 60, 10)) < 1);
  });

  it("clamps to the ends of the segment", () => {
    assert.equal(projectOnSegment(0, -1, 0, 0, 0, 1).t, 0);
    assert.equal(projectOnSegment(0, 2, 0, 0, 0, 1).t, 1);
  });

  it("offers the closest edge per route within the radius, nearest first, skipping ignored routes", () => {
    const near = findNearbyEdges(0.0001, 0.005, EDGES, 100); // ~11 m north of red A-B's middle
    assert.deepEqual(near.map((c) => c.edge.route), ["red"]);
    assert.equal(near[0]!.t.toFixed(2), "0.50");
    assert.equal(findNearbyEdges(0.0001, 0.005, EDGES, 100, "red").length, 0);
    assert.equal(findNearbyEdges(0.005, 0.005, EDGES, 10).length, 0);
  });
});

describe("the bundled London data", () => {
  const read = (name: string) => readFileSync(fileURLToPath(new URL(`../public/data/${name}`, import.meta.url)), "utf-8");
  const nodes = parseNodes(read("nodes.csv"));
  const edges = parseEdges(read("edges.csv"), nodes);
  const areas = parseAreas(read("areas.csv"), nodes);

  it("parses and every edge resolves to a node", () => {
    assert.equal(nodes.length, 358);
    assert.equal(edges.length, 492);
    assert.equal(areas.length, 5244);
    assert.ok(nodes.every((n) => Number.isFinite(n.lat) && Number.isFinite(n.lon)));
  });

  it("is one connected network", () => {
    const g = buildGraph(nodes, edges);
    const reach = [...shortestTimes(g, nodes[0]!.id).values()].filter(Number.isFinite).length;
    assert.equal(reach, nodes.length);
  });

  it("assigns every area a real node", () => {
    const ids = new Set(nodes.map((n) => n.id));
    assert.ok(areas.every((a) => ids.has(a.nearestNodeId)));
  });

  it("prices transfers at the fixed time and rides by distance", () => {
    const transfer = edges.find((e) => e.route === "interchange")!;
    assert.equal(transfer.minutes, 2);
    const ride = edges.find((e) => e.route !== "interchange")!;
    assert.ok(Math.abs(ride.minutes - (ride.distKm / 0.55 + 0.5)) < 1e-9);
  });

  it("a real two-route interchange between nearby crossing lines helps travellers", () => {
    // Find two edges from different routes that pass within 150 m without sharing a node:
    // lines that cross without a station. Link them with a node and the network should get faster.
    const base = buildGraph(nodes, edges);
    const before = baselineMeans(base);
    let found: Pick[] | null = null;
    for (const e of edges.filter((x) => x.route !== "interchange")) {
      const mid = { lat: (e.fromLat + e.toLat) / 2, lon: (e.fromLon + e.toLon) / 2 };
      const near = findNearbyEdges(mid.lat, mid.lon, edges, 150, "interchange");
      const other = near.find((c) => c.edge.route !== e.route && ![e.fromId, e.toId].includes(c.edge.fromId) && ![e.fromId, e.toId].includes(c.edge.toId));
      if (other) {
        found = [{ edge: e, t: 0.5 }, { edge: other.edge, t: other.t }];
        break;
      }
    }
    assert.ok(found, "expected the dataset to contain crossing lines");
    const result = simulate(base, before, areas, found!);
    assert.equal(result.metrics.nodesPenalised, 0);
    assert.ok(result.metrics.netMinutes <= 0);
    console.log("  crossing found:", found!.map((p) => p.edge.route).join(" x "), "net minutes", result.metrics.netMinutes.toFixed(3), "benefited", result.metrics.nodesBenefited);
  });
});

describe("formatChange", async () => {
  const { formatChange, formatDuration } = await import("../src/lib/format.js");
  it("shows small changes in seconds and signs them", () => {
    assert.equal(formatChange(-0.002), "-0.1 s");
    assert.equal(formatChange(0.5), "+30.0 s");
    assert.equal(formatChange(-1.5), "-1.50 min");
    assert.equal(formatChange(0), "0.0 s");
  });
  it("formats unsigned durations", () => assert.equal(formatDuration(-0.25), "15.0 s"));
});
