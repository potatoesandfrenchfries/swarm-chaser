import { SCENARIO } from "../config";
import { meanTravelTimes } from "./dijkstra";
import { cloneGraph, insertNode } from "./graph";
import type { Area, Graph, Impact, Metrics, Pick } from "./types";

/** Baseline mean travel time per node. Compute once and reuse for every scenario. */
export const baselineMeans = (graph: Graph) => meanTravelTimes(graph, [...graph.keys()]);

/**
 * What changes if a node is added at these picks?
 * Deltas are modified minus baseline, so NEGATIVE means faster (an improvement).
 */
export function simulate(baseline: Graph, baselineMeansByNode: Map<string, number>, areas: Area[], picks: Pick[]): Impact {
  const modified = cloneGraph(baseline);
  insertNode(modified, "__new__", picks);

  const after = meanTravelTimes(modified, [...baseline.keys()]);
  const nodeDeltas = new Map<string, number>();
  for (const [id, before] of baselineMeansByNode) nodeDeltas.set(id, (after.get(id) ?? before) - before);

  // An area feels the change at the node it uses to reach the network.
  const areaDeltas = new Map<string, number>();
  for (const area of areas) areaDeltas.set(area.id, nodeDeltas.get(area.nearestNodeId) ?? 0);

  return { nodeDeltas, areaDeltas, metrics: summarise(nodeDeltas, areaDeltas, areas) };
}

export function summarise(nodeDeltas: Map<string, number>, areaDeltas: Map<string, number>, areas: Area[]): Metrics {
  const eps = SCENARIO.epsilonMin;
  let netMinutes = 0;
  let nodesBenefited = 0;
  let nodesPenalised = 0;
  let maxBenefit = 0;
  let maxPenalty = 0;
  for (const d of nodeDeltas.values()) {
    netMinutes += d;
    if (d < -eps) {
      nodesBenefited += 1;
      maxBenefit = Math.max(maxBenefit, -d);
    } else if (d > eps) {
      nodesPenalised += 1;
      maxPenalty = Math.max(maxPenalty, d);
    }
  }

  let areasBenefited = 0;
  let areasPenalised = 0;
  let weighted = 0;
  let weightSum = 0;
  for (const area of areas) {
    const d = areaDeltas.get(area.id) ?? 0;
    if (d < -eps) areasBenefited += 1;
    else if (d > eps) areasPenalised += 1;
    weighted += d * area.weight;
    weightSum += area.weight;
  }

  return {
    netMinutes,
    avgMinutes: nodeDeltas.size ? netMinutes / nodeDeltas.size : 0,
    nodesBenefited,
    nodesPenalised,
    areasBenefited,
    areasPenalised,
    maxBenefit,
    maxPenalty,
    weightedAreaMinutes: weightSum ? weighted / weightSum : 0,
  };
}
