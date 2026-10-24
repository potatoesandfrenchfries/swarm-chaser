import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { IMPACT_COLOURS, SCENARIO } from "../config";
import { useStore } from "../store/useStore";
import { areasSource, candidatesSource, newLinksSource, newNodeSource, nodesSource, routesSource, transfersSource } from "./sources";

const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function setData(map: maplibregl.Map, id: string, data: GeoJSON.FeatureCollection) {
  (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data);
}

export default function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);

  const { nodes, edges, areas, phase, point, candidates, selected, impact } = useStore();

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: { base: { type: "raster", tiles: SCENARIO.map.tiles, tileSize: 256, attribution: SCENARIO.map.attribution } },
        layers: [{ id: "base", type: "raster", source: "base", paint: { "raster-brightness-max": 0.55, "raster-saturation": -0.6 } }],
      },
      center: SCENARIO.map.center,
      zoom: SCENARIO.map.zoom,
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    map.on("load", () => {
      for (const id of ["areas", "routes", "transfers", "candidates", "nodes", "new-node", "new-links"]) {
        map.addSource(id, { type: "geojson", data: empty });
      }
      map.addLayer({ id: "areas", type: "circle", source: "areas", paint: { "circle-radius": 4, "circle-opacity": 0, "circle-color": IMPACT_COLOURS.neutral } });
      map.addLayer({ id: "routes", type: "line", source: "routes", layout: { "line-cap": "round" }, paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-opacity": 0.85 } });
      map.addLayer({ id: "transfers", type: "line", source: "transfers", paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0.4, "line-dasharray": [2, 2] } });
      map.addLayer({ id: "candidates", type: "line", source: "candidates", layout: { "line-cap": "round" }, paint: { "line-color": ["get", "color"], "line-width": 8, "line-opacity": 0.5 } });
      map.addLayer({ id: "nodes", type: "circle", source: "nodes", paint: { "circle-radius": 4, "circle-color": ["get", "color"], "circle-stroke-width": 1.5, "circle-stroke-color": "#fff" } });
      map.addLayer({ id: "new-links", type: "line", source: "new-links", paint: { "line-color": ["get", "color"], "line-width": 3, "line-dasharray": [3, 2] } });
      map.addLayer({ id: "new-node", type: "circle", source: "new-node", paint: { "circle-radius": 9, "circle-color": "#00d4ff", "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });

      // Hover a node for its name. Built with DOM nodes, not HTML, so data cannot inject markup.
      const popup = new maplibregl.Popup({ closeButton: false, offset: 10 });
      map.on("mousemove", "nodes", (e) => {
        const props = e.features?.[0]?.properties;
        if (!props) return;
        const box = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = String(props.name);
        const routes = document.createElement("div");
        routes.textContent = String(props.routes);
        routes.style.fontSize = "12px";
        box.append(name, routes);
        popup.setLngLat(e.lngLat).setDOMContent(box).addTo(map);
      });
      map.on("mouseleave", "nodes", () => popup.remove());

      map.on("click", (e) => {
        if (useStore.getState().phase === "placing") useStore.getState().place(e.lngLat.lat, e.lngLat.lng);
      });
      setLoaded(true);
      useStore.getState().setMapReady();
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Static layers, once both the map and the data are ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || nodes.length === 0) return;
    setData(map, "nodes", nodesSource(nodes));
    setData(map, "routes", routesSource(edges));
    setData(map, "transfers", transfersSource(edges));
  }, [loaded, nodes, edges]);

  // The placement in progress.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    setData(map, "candidates", candidatesSource(phase === "connecting" ? candidates : []));
    setData(map, "new-node", newNodeSource(point));
    setData(map, "new-links", newLinksSource(candidates, selected, point));
  }, [loaded, phase, point, candidates, selected]);

  // The result, as a colour scale on the areas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || areas.length === 0) return;
    setData(map, "areas", areasSource(areas, impact?.areaDeltas ?? null));
    if (!impact) return void map.setPaintProperty("areas", "circle-opacity", 0);

    const max = Math.max(1e-6, ...[...impact.areaDeltas.values()].map(Math.abs));
    const { benefit, neutral, penalty } = IMPACT_COLOURS;
    map.setPaintProperty("areas", "circle-color", ["interpolate", ["linear"], ["get", "delta"], -max, benefit, 0, neutral, max, penalty]);
    map.setPaintProperty("areas", "circle-opacity", ["interpolate", ["linear"], ["abs", ["get", "delta"]], 0, 0.25, max, 0.85]);
  }, [loaded, areas, impact]);

  useEffect(() => {
    mapRef.current?.getCanvas().style.setProperty("cursor", phase === "placing" ? "crosshair" : "");
  }, [phase]);

  return <div ref={container} className="absolute inset-0" />;
}
