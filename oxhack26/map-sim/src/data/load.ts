import Papa from "papaparse";
import { SCENARIO } from "../config";
import { nearestNodeId } from "../engine/geometry";
import type { Area, Edge, NetNode } from "../engine/types";

// Parsing is separate from fetching so tests can run it on the real files.

const rows = <T>(text: string) => Papa.parse<T>(text, { header: true, skipEmptyLines: true }).data;

export function parseNodes(text: string): NetNode[] {
  return rows<{ id: string; name: string; lat: string; lon: string; routes: string }>(text).map((r) => ({
    id: r.id,
    name: r.name,
    lat: Number(r.lat),
    lon: Number(r.lon),
    routes: r.routes ? r.routes.split("|") : [],
  }));
}

export function parseEdges(text: string, nodes: NetNode[]): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const { kmPerMin, dwellMin, transferMin, transferRoute } = SCENARIO.travel;
  return rows<{ from_id: string; to_id: string; route: string; distance_km: string }>(text).map((r) => {
    const from = byId.get(r.from_id);
    const to = byId.get(r.to_id);
    if (!from || !to) throw new Error(`Edge ${r.from_id} -> ${r.to_id} refers to a node that is not in the nodes file.`);
    const distKm = Number(r.distance_km);
    return {
      fromId: from.id,
      toId: to.id,
      route: r.route,
      distKm,
      minutes: r.route === transferRoute ? transferMin : distKm / kmPerMin + dwellMin,
      fromLat: from.lat,
      fromLon: from.lon,
      toLat: to.lat,
      toLon: to.lon,
    };
  });
}

export function parseAreas(text: string, nodes: NetNode[]): Area[] {
  return rows<{ id: string; name: string; lat: string; lon: string; weight?: string }>(text).map((r) => {
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    const weight = r.weight ? Number(r.weight) : 1;
    return { id: r.id, name: r.name, lat, lon, weight: Number.isFinite(weight) ? weight : 1, nearestNodeId: nearestNodeId(lat, lon, nodes) };
  });
}

async function text(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status}).`);
  return res.text();
}

export async function loadAll() {
  const [nodesText, edgesText, areasText] = await Promise.all([
    text(SCENARIO.data.nodes),
    text(SCENARIO.data.edges),
    text(SCENARIO.data.areas),
  ]);
  const nodes = parseNodes(nodesText);
  return { nodes, edges: parseEdges(edgesText, nodes), areas: parseAreas(areasText, nodes) };
}
