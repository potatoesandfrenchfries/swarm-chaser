import type { Edge, Graph, NetNode, Pick } from "./types";

export function buildGraph(nodes: NetNode[], edges: Edge[]): Graph {
  const graph: Graph = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    graph.get(e.fromId)?.push({ toId: e.toId, minutes: e.minutes, route: e.route });
    graph.get(e.toId)?.push({ toId: e.fromId, minutes: e.minutes, route: e.route });
  }
  return graph;
}

export function cloneGraph(graph: Graph): Graph {
  return new Map([...graph].map(([id, out]) => [id, out.map((e) => ({ ...e }))]));
}

function removeEdge(graph: Graph, from: string, to: string, route: string) {
  const out = graph.get(from);
  const i = out?.findIndex((e) => e.toId === to && e.route === route) ?? -1;
  if (i >= 0) out!.splice(i, 1);
}

/**
 * Put a new node on each picked edge. The edge is replaced by two halves whose
 * times add up to the original, so a node on a single edge changes nothing by
 * itself; the benefit appears when picks from different routes meet at the node.
 *
 * Assumption: the new node is a free interchange (zero transfer time between the
 * routes that meet there), which flatters the result. Model a transfer penalty
 * if that matters for your case.
 */
export function insertNode(graph: Graph, newId: string, picks: Pick[]): void {
  graph.set(newId, []);
  for (const { edge, t } of picks) {
    removeEdge(graph, edge.fromId, edge.toId, edge.route);
    removeEdge(graph, edge.toId, edge.fromId, edge.route);

    const toNew = edge.minutes * t;
    const fromNew = edge.minutes * (1 - t);
    graph.get(edge.fromId)!.push({ toId: newId, minutes: toNew, route: edge.route });
    graph.get(newId)!.push({ toId: edge.fromId, minutes: toNew, route: edge.route });
    graph.get(newId)!.push({ toId: edge.toId, minutes: fromNew, route: edge.route });
    graph.get(edge.toId)!.push({ toId: newId, minutes: fromNew, route: edge.route });
  }
}
