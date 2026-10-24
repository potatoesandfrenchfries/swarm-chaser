import type { Graph } from "./types";

/** Binary min-heap of [distance, node]. */
class MinHeap {
  private items: [number, string][] = [];

  get size() {
    return this.items.length;
  }

  push(dist: number, id: string) {
    const items = this.items;
    items.push([dist, id]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[i]![0] >= items[parent]![0]) break;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }

  pop(): [number, string] | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (top === undefined || last === undefined) return top;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        let smallest = i;
        for (const child of [2 * i + 1, 2 * i + 2]) {
          if (child < items.length && items[child]![0] < items[smallest]![0]) smallest = child;
        }
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest]!, items[i]!];
        i = smallest;
      }
    }
    return top;
  }
}

/** Shortest travel time from `source` to every node (Infinity if unreachable). */
export function shortestTimes(graph: Graph, source: string): Map<string, number> {
  const dist = new Map<string, number>([...graph.keys()].map((id) => [id, Infinity]));
  dist.set(source, 0);
  const heap = new MinHeap();
  heap.push(0, source);

  for (let next = heap.pop(); next; next = heap.pop()) {
    const [d, u] = next;
    if (d > dist.get(u)!) continue; // a shorter route to u was already settled
    for (const { toId, minutes } of graph.get(u) ?? []) {
      const candidate = d + minutes;
      if (candidate < dist.get(toId)!) {
        dist.set(toId, candidate);
        heap.push(candidate, toId);
      }
    }
  }
  return dist;
}

/**
 * Mean travel time from each of `nodeIds` to every other node in `nodeIds` it can
 * reach. Passing the same set for the baseline and the modified graph is what keeps
 * the comparison fair: a node added by the scenario is a way to travel, not a new
 * destination, and counting it would shift every mean even when nothing improved.
 */
export function meanTravelTimes(graph: Graph, nodeIds: string[]): Map<string, number> {
  const inSet = new Set(nodeIds);
  const means = new Map<string, number>();
  for (const source of nodeIds) {
    let total = 0;
    let count = 0;
    for (const [id, d] of shortestTimes(graph, source)) {
      if (id !== source && inSet.has(id) && d < Infinity) {
        total += d;
        count += 1;
      }
    }
    means.set(source, count > 0 ? total / count : 0);
  }
  return means;
}
