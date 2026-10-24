export interface NetNode {
  id: string;
  name: string;
  lat: number;
  lon: number;
  routes: string[];
}

export interface Edge {
  fromId: string;
  toId: string;
  route: string;
  distKm: number;
  /** Travel time in minutes, either direction. */
  minutes: number;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
}

/** A place that experiences the network (a neighbourhood, a postcode, a customer). */
export interface Area {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Importance in weighted averages: population, deprivation, demand. Defaults to 1. */
  weight: number;
  /** The node an area uses to reach the network, assigned once at load. */
  nearestNodeId: string;
}

export interface GraphEdge {
  toId: string;
  minutes: number;
  route: string;
}
export type Graph = Map<string, GraphEdge[]>;

/** Where on an edge a new node would sit. t = 0 is `fromId`, t = 1 is `toId`. */
export interface Pick {
  edge: Edge;
  t: number;
}

export interface Candidate extends Pick {
  /** Distance from the clicked point to the edge, in metres. */
  distanceM: number;
  projLat: number;
  projLon: number;
}

export interface Metrics {
  /** Sum of every node's change in mean travel time. Negative is better. */
  netMinutes: number;
  /** Mean change per node, in minutes. */
  avgMinutes: number;
  nodesBenefited: number;
  nodesPenalised: number;
  areasBenefited: number;
  areasPenalised: number;
  /** Largest improvement and worst penalty, in minutes (both reported as positive numbers). */
  maxBenefit: number;
  maxPenalty: number;
  /** Mean change across areas, weighted by `Area.weight`. */
  weightedAreaMinutes: number;
}

export interface Impact {
  nodeDeltas: Map<string, number>;
  areaDeltas: Map<string, number>;
  metrics: Metrics;
}
