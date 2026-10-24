import { FALLBACK_COLOUR, ROUTE_COLOURS, SCENARIO } from "../config";
import type { Area, Candidate, Edge, NetNode } from "../engine/types";

type FC = GeoJSON.FeatureCollection;
const empty: FC = { type: "FeatureCollection", features: [] };
const colour = (route: string) => ROUTE_COLOURS[route] ?? FALLBACK_COLOUR;
const line = (a: [number, number], b: [number, number], properties: GeoJSON.GeoJsonProperties): GeoJSON.Feature => ({
  type: "Feature",
  geometry: { type: "LineString", coordinates: [a, b] },
  properties,
});
const ends = (e: Edge): [[number, number], [number, number]] => [[e.fromLon, e.fromLat], [e.toLon, e.toLat]];

export const nodesSource = (nodes: NetNode[]): FC => ({
  type: "FeatureCollection",
  features: nodes.map((n) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [n.lon, n.lat] },
    properties: { name: n.name, routes: n.routes.join(", "), color: colour(n.routes[0] ?? "") },
  })),
});

export const routesSource = (edges: Edge[]): FC => ({
  type: "FeatureCollection",
  features: edges.filter((e) => e.route !== SCENARIO.travel.transferRoute).map((e) => line(...ends(e), { color: colour(e.route) })),
});

export const transfersSource = (edges: Edge[]): FC => ({
  type: "FeatureCollection",
  features: edges.filter((e) => e.route === SCENARIO.travel.transferRoute).map((e) => line(...ends(e), {})),
});

export const candidatesSource = (candidates: Candidate[]): FC => ({
  type: "FeatureCollection",
  features: candidates.map((c) => line(...ends(c.edge), { color: colour(c.edge.route) })),
});

export const newNodeSource = (point: { lat: number; lon: number } | null): FC =>
  point ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [point.lon, point.lat] }, properties: {} }] } : empty;

/** The two halves of each selected edge, bent through the new node. */
export function newLinksSource(candidates: Candidate[], selected: Set<string>, point: { lat: number; lon: number } | null): FC {
  if (!point) return empty;
  const at: [number, number] = [point.lon, point.lat];
  const features = candidates
    .filter((c) => selected.has(`${c.edge.fromId}|${c.edge.toId}|${c.edge.route}`))
    .flatMap((c) => {
      const [a, b] = ends(c.edge);
      return [line(a, at, { color: colour(c.edge.route) }), line(at, b, { color: colour(c.edge.route) })];
    });
  return { type: "FeatureCollection", features };
}

/** Areas as points, each carrying its delta (minutes) once there is a result. */
export const areasSource = (areas: Area[], deltas: Map<string, number> | null): FC => ({
  type: "FeatureCollection",
  features: areas.map((a) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [a.lon, a.lat] },
    properties: { name: a.name, delta: deltas?.get(a.id) ?? 0 },
  })),
});
