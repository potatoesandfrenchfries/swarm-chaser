// Everything that makes this the London Underground demo lives in this file and
// in public/data/. To simulate a different network (a bus system, a road grid, a
// supply chain), replace the three CSVs and edit the values below.

export const SCENARIO = {
  title: "Network what-if",
  /** What a node and a route are called in the UI. */
  nodeLabel: "station",
  routeLabel: "line",

  map: {
    center: [-0.09, 51.505] as [number, number],
    zoom: 10.5,
    /** Raster tiles. OSM's tile servers are for light use: swap in your own provider for anything public. */
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: "© OpenStreetMap contributors",
  },

  data: {
    nodes: "/data/nodes.csv",
    edges: "/data/edges.csv",
    areas: "/data/areas.csv",
  },

  travel: {
    /** Distance covered per minute while moving. */
    kmPerMin: 0.55,
    /** Time added per edge (stopping, boarding). */
    dwellMin: 0.5,
    /** Fixed time for edges whose route is `transferRoute`. */
    transferMin: 2,
    transferRoute: "interchange",
  },

  /** How close a click must be to an edge to offer it as a connection. */
  nearbyEdgeRadiusM: 100,
  /** Time changes smaller than this (minutes) count as no change. */
  epsilonMin: 0.001,
};

export const ROUTE_COLOURS: Record<string, string> = {
  bakerloo: "#B36305",
  central: "#E32017",
  circle: "#FFD300",
  district: "#00782A",
  "hammersmith-city": "#F3A9BB",
  jubilee: "#A0A5A9",
  metropolitan: "#9B0056",
  northern: "#4a4a4a",
  piccadilly: "#003688",
  victoria: "#0098D4",
  "waterloo-city": "#95CDBA",
  dlr: "#00A4A7",
  elizabeth: "#6950A1",
  overground: "#EE7C0E",
};
export const FALLBACK_COLOUR = "#888888";

export const IMPACT_COLOURS = { benefit: "#27AE60", neutral: "#64748b", penalty: "#C0392B" };
