import { create } from "zustand";
import { SCENARIO } from "../config";
import { buildGraph } from "../engine/graph";
import { findNearbyEdges } from "../engine/geometry";
import { baselineMeans, simulate } from "../engine/impact";
import type { Area, Candidate, Edge, Graph, Impact, Metrics, NetNode, Pick } from "../engine/types";

export type Phase = "idle" | "placing" | "connecting" | "viewing";

export const edgeKey = (e: Pick["edge"]) => `${e.fromId}|${e.toId}|${e.route}`;

/** A saved scenario: just where the node goes. Results are recomputed on load, so storage stays tiny. */
export interface Scenario {
  id: string;
  name: string;
  savedAt: number;
  lat: number;
  lon: number;
  picks: { edgeKey: string; t: number }[];
  metrics: Metrics;
}

const STORAGE_KEY = "map-sim-scenarios";

function readScenarios(): Scenario[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Scenario[];
  } catch {
    return [];
  }
}
function writeScenarios(scenarios: Scenario[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  } catch {
    // Storage full or blocked: scenarios still work for this visit.
  }
}

interface State {
  /** Data parsed and the baseline computed. */
  ready: boolean;
  /** The map has loaded its style and layers, so clicks are handled. */
  mapReady: boolean;
  nodes: NetNode[];
  edges: Edge[];
  areas: Area[];
  edgesByKey: Map<string, Edge>;
  baseline: Graph;
  means: Map<string, number>;

  phase: Phase;
  toast: string | null;
  point: { lat: number; lon: number } | null;
  candidates: Candidate[];
  selected: Set<string>;
  impact: Impact | null;

  scenarios: Scenario[];
  activeId: string | null;
  compareIds: Set<string>;
  showCompare: boolean;

  setMapReady: () => void;
  init: (data: { nodes: NetNode[]; edges: Edge[]; areas: Area[] }) => void;
  startPlacing: () => void;
  place: (lat: number, lon: number) => void;
  toggleEdge: (key: string) => void;
  compute: () => void;
  reset: () => void;
  notify: (message: string) => void;

  save: (name?: string) => void;
  load: (id: string) => void;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  toggleCompare: (id: string) => void;
  setShowCompare: (show: boolean) => void;
}

export const useStore = create<State>((set, get) => {
  /** The picks currently selected, in the shape the engine wants. */
  const currentPicks = (): Pick[] =>
    get().candidates.filter((c) => get().selected.has(edgeKey(c.edge))).map(({ edge, t }) => ({ edge, t }));

  return {
    ready: false,
    mapReady: false,
    nodes: [],
    edges: [],
    areas: [],
    edgesByKey: new Map(),
    baseline: new Map(),
    means: new Map(),

    phase: "idle",
    toast: null,
    point: null,
    candidates: [],
    selected: new Set(),
    impact: null,

    scenarios: readScenarios(),
    activeId: null,
    compareIds: new Set(),
    showCompare: false,

    setMapReady: () => set({ mapReady: true }),

    init({ nodes, edges, areas }) {
      const baseline = buildGraph(nodes, edges);
      set({
        ready: true,
        nodes,
        edges,
        areas,
        edgesByKey: new Map(edges.map((e) => [edgeKey(e), e])),
        baseline,
        means: baselineMeans(baseline),
      });
    },

    startPlacing: () => set({ phase: "placing" }),

    place(lat, lon) {
      const candidates = findNearbyEdges(lat, lon, get().edges, SCENARIO.nearbyEdgeRadiusM, SCENARIO.travel.transferRoute);
      if (candidates.length === 0) {
        get().notify(`No ${SCENARIO.routeLabel} within ${SCENARIO.nearbyEdgeRadiusM} m. Click closer to one.`);
        return;
      }
      set({
        phase: "connecting",
        point: { lat, lon },
        candidates,
        selected: new Set(candidates.map((c) => edgeKey(c.edge))), // start with everything in reach
      });
    },

    toggleEdge(key) {
      const next = new Set(get().selected);
      if (!next.delete(key)) next.add(key);
      set({ selected: next });
    },

    compute() {
      const picks = currentPicks();
      if (picks.length === 0) return;
      const { baseline, means, areas } = get();
      set({ impact: simulate(baseline, means, areas, picks), phase: "viewing" });
    },

    reset: () => set({ phase: "idle", point: null, candidates: [], selected: new Set(), impact: null, activeId: null }),

    notify(message) {
      set({ toast: message });
      setTimeout(() => get().toast === message && set({ toast: null }), 2500);
    },

    save(name) {
      const { impact, point, scenarios } = get();
      if (!impact || !point) return;
      const picks = currentPicks().map((p) => ({ edgeKey: edgeKey(p.edge), t: p.t }));
      const scenario: Scenario = {
        id: `s_${Date.now()}`,
        name: name ?? `New ${SCENARIO.nodeLabel} at ${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`,
        savedAt: Date.now(),
        lat: point.lat,
        lon: point.lon,
        picks,
        metrics: impact.metrics,
      };
      const next = [scenario, ...scenarios];
      writeScenarios(next);
      set({ scenarios: next, activeId: scenario.id });
    },

    load(id) {
      const { scenarios, edgesByKey, baseline, means, areas } = get();
      const scenario = scenarios.find((s) => s.id === id);
      if (!scenario) return;
      const candidates: Candidate[] = scenario.picks.flatMap(({ edgeKey: key, t }) => {
        const edge = edgesByKey.get(key);
        return edge ? [{ edge, t, distanceM: 0, projLat: scenario.lat, projLon: scenario.lon }] : [];
      });
      if (candidates.length === 0) return get().notify("That scenario's connections no longer exist in the data.");
      set({
        phase: "viewing",
        point: { lat: scenario.lat, lon: scenario.lon },
        candidates,
        selected: new Set(candidates.map((c) => edgeKey(c.edge))),
        impact: simulate(baseline, means, areas, candidates.map(({ edge, t }) => ({ edge, t }))),
        activeId: id,
      });
    },

    remove(id) {
      const next = get().scenarios.filter((s) => s.id !== id);
      writeScenarios(next);
      const compareIds = new Set(get().compareIds);
      compareIds.delete(id);
      set({ scenarios: next, compareIds, activeId: get().activeId === id ? null : get().activeId });
    },

    rename(id, name) {
      const next = get().scenarios.map((s) => (s.id === id ? { ...s, name } : s));
      writeScenarios(next);
      set({ scenarios: next });
    },

    toggleCompare(id) {
      const next = new Set(get().compareIds);
      if (!next.delete(id)) next.add(id);
      set({ compareIds: next });
    },

    setShowCompare: (showCompare) => set({ showCompare }),
  };
});
