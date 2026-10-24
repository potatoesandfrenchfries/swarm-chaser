import type { Candidate, Edge } from "./types";

const R_EARTH_M = 6_371_000;
const RAD = Math.PI / 180;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return R_EARTH_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Project a point onto the segment A-B. Works in local metres (longitude scaled
 * by cos latitude), so `t` is a true fraction of the segment's length; doing it in
 * raw degrees would skew `t` wherever a degree of longitude is shorter than one of latitude.
 */
export function projectOnSegment(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): { t: number; projLat: number; projLon: number; distM: number } {
  const k = Math.cos(pLat * RAD);
  const toXY = (lat: number, lon: number) => [(lon - pLon) * RAD * k * R_EARTH_M, (lat - pLat) * RAD * R_EARTH_M] as const;
  const [ax, ay] = toXY(aLat, aLon);
  const [bx, by] = toXY(bLat, bLon);

  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  // The point is the origin of this local frame, so A->P is (-ax, -ay).
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (-ax * abx + -ay * aby) / lenSq));

  const projLat = aLat + t * (bLat - aLat);
  const projLon = aLon + t * (bLon - aLon);
  return { t, projLat, projLon, distM: haversineM(pLat, pLon, projLat, projLon) };
}

/** The closest edge of each route within `radiusM` of a point, skipping `ignoreRoute` (transfer links). */
export function findNearbyEdges(
  lat: number,
  lon: number,
  edges: Edge[],
  radiusM: number,
  ignoreRoute?: string
): Candidate[] {
  const bestPerRoute = new Map<string, Candidate>();
  for (const edge of edges) {
    if (edge.route === ignoreRoute) continue;
    const { t, projLat, projLon, distM } = projectOnSegment(lat, lon, edge.fromLat, edge.fromLon, edge.toLat, edge.toLon);
    if (distM > radiusM) continue;
    const best = bestPerRoute.get(edge.route);
    if (!best || distM < best.distanceM) bestPerRoute.set(edge.route, { edge, t, distanceM: distM, projLat, projLon });
  }
  return [...bestPerRoute.values()].sort((a, b) => a.distanceM - b.distanceM);
}

/** Nearest node by flat-earth distance: cheap, and accurate enough over a city. */
export function nearestNodeId(lat: number, lon: number, nodes: { id: string; lat: number; lon: number }[]): string {
  const k = Math.cos(lat * RAD);
  let best = "";
  let bestSq = Infinity;
  for (const n of nodes) {
    const dy = n.lat - lat;
    const dx = (n.lon - lon) * k;
    const sq = dx * dx + dy * dy;
    if (sq < bestSq) {
      bestSq = sq;
      best = n.id;
    }
  }
  return best;
}
