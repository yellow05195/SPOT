"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MlMap, Marker, NavigationControl, AttributionControl, setWorkerUrl, type StyleSpecification, type ErrorEvent } from "maplibre-gl";
import { cityCoords } from "@/lib/cities";
import { iconSources } from "@/lib/logos";

export interface LivePin {
  id: number;
  city: string;
  brand: string;
  hot?: boolean;
}

/** OpenFreeMap vector tiles (free, no key) drawn in the site's near-black register, buildings extruded from zoom 14. */
const STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: { omt: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0e0e10" } },
    { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": "#07070a" } },
    { id: "park", type: "fill", source: "omt", "source-layer": "park", minzoom: 9, paint: { "fill-color": "#141a14", "fill-opacity": 0.7 } },
    { id: "landuse", type: "fill", source: "omt", "source-layer": "landuse", minzoom: 11, filter: ["in", "class", "residential", "commercial", "industrial", "retail"], paint: { "fill-color": "#121214" } },
    { id: "boundary", type: "line", source: "omt", "source-layer": "boundary", filter: ["all", ["==", "admin_level", 2], ["!=", "maritime", 1]], paint: { "line-color": "#2a2a30", "line-width": 1 } },
    { id: "road-minor", type: "line", source: "omt", "source-layer": "transportation", minzoom: 12, filter: ["in", "class", "minor", "service", "track", "path", "tertiary"], paint: { "line-color": "#232327", "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 12, 0.6, 16, 3, 19, 10] } },
    { id: "road-major", type: "line", source: "omt", "source-layer": "transportation", minzoom: 7, filter: ["in", "class", "motorway", "trunk", "primary", "secondary"], paint: { "line-color": "#34343a", "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 7, 0.4, 12, 1.4, 16, 5, 19, 16] } },
    { id: "rail", type: "line", source: "omt", "source-layer": "transportation", minzoom: 13, filter: ["==", "class", "rail"], paint: { "line-color": "#26262b", "line-width": 1, "line-dasharray": [3, 3] } },
    {
      id: "buildings",
      type: "fill-extrusion",
      source: "omt",
      "source-layer": "building",
      minzoom: 13.5,
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 8], 0, "#1c1c21", 40, "#26262c", 150, "#33333a"],
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13.5, 0, 15, ["coalesce", ["get", "render_height"], 8]],
        "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 13.5, 0, 15, ["coalesce", ["get", "render_min_height"], 0]],
        "fill-extrusion-opacity": 0.92,
      },
    },
    {
      id: "street-names",
      type: "symbol",
      source: "omt",
      "source-layer": "transportation_name",
      minzoom: 14.5,
      layout: { "symbol-placement": "line", "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-letter-spacing": 0.04 },
      paint: { "text-color": "#8b8b94", "text-halo-color": "#0e0e10", "text-halo-width": 1.2 },
    },
    {
      id: "places",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      maxzoom: 14,
      filter: ["in", "class", "country", "city", "state", "town"],
      layout: {
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["match", ["get", "class"], "country", 12, "city", 12, "state", 10, 10],
        "text-transform": ["match", ["get", "class"], "country", "uppercase", "none"],
        "text-letter-spacing": ["match", ["get", "class"], "country", 0.12, 0.02],
        "text-padding": 6,
      },
      paint: { "text-color": ["match", ["get", "class"], "country", "#55555e", "#a3a3ab"], "text-halo-color": "#0e0e10", "text-halo-width": 1.4 },
    },
  ],
};

// MapLibre 6 runs its parser in a separate module worker; the bundler cannot locate it, so we serve it ourselves.
if (typeof window !== "undefined") setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

interface Spot {
  city: string;
  hot: boolean;
  lngLat: [number, number];
  pins: LivePin[];
}

const WORLD = { center: [12, 22] as [number, number], zoom: 1.15 };

/**
 * One marker per sighting: the brand's own icon, fanned in a small ring around the city point
 * (the app never knows a position finer than a city), with the city name once. Click any of
 * them to fly down to the streets.
 */
export function LiveMapInner({ pins, height, onReady }: { pins: LivePin[]; height: number; onReady?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [zoomedIn, setZoomedIn] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!box.current) return;
    try {
      const spots = new Map<string, Spot>();
      for (const p of pins) {
        const c = cityCoords(p.city);
        if (!c) continue;
        const s = spots.get(p.city) ?? { city: p.city, hot: false, lngLat: c, pins: [] };
        s.pins.push(p);
        s.hot = s.hot || Boolean(p.hot);
        spots.set(p.city, s);
      }
      const map = new MlMap({
        container: box.current,
        style: STYLE,
        center: WORLD.center,
        zoom: WORLD.zoom,
        minZoom: 0.8,
        maxZoom: 19,
        maxPitch: 72,
        attributionControl: false,
        scrollZoom: false,
        renderWorldCopies: false,
        fadeDuration: 150,
      });
      mapRef.current = map;
      (window as unknown as { __spotMap?: MlMap }).__spotMap = map; // lets tooling (recordings, tests) drive the camera
      map.addControl(new NavigationControl({ visualizePitch: true, showCompass: true }), "top-right");
      map.addControl(new AttributionControl({ compact: true, customAttribution: "© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors" }), "bottom-right");

      const fly = (s: Spot) => map.flyTo({ center: s.lngLat, zoom: 16.4, pitch: 62, bearing: -18, duration: 2600, essential: true });

      for (const s of spots.values()) {
        // the city name, once, to the right of the ring
        const label = document.createElement("button");
        label.type = "button";
        label.className = "livemap-city";
        label.setAttribute("aria-label", `Fly to ${s.city}`);
        label.textContent = `${s.city.split(",")[0]}${s.pins.length > 1 ? ` ×${s.pins.length}` : ""}`;
        label.addEventListener("click", (e) => {
          e.stopPropagation();
          fly(s);
        });
        const ringRadius = s.pins.length > 1 ? 13 + Math.min(s.pins.length, 8) : 0;
        new Marker({ element: label, anchor: "left", offset: [ringRadius + 8, 0] }).setLngLat(s.lngLat).addTo(map);

        // one brand icon per sighting, on a small ring around the city point
        s.pins.forEach((p, i) => {
          const angle = (i / s.pins.length) * Math.PI * 2 - Math.PI / 2;
          const el = document.createElement("button");
          el.type = "button";
          el.className = `livemap-pin ${p.hot ? "livemap-pin-hot" : ""}`;
          el.setAttribute("aria-label", `${p.brand}, ${s.city}. Fly there`);
          el.title = `${p.brand} · ${s.city}`;
          const src = iconSources(p.brand)[0];
          el.innerHTML = src ? `<img src="${src}" alt="" width="22" height="22" />` : `<span class="livemap-letter">${p.brand.slice(0, 1)}</span>`;
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            fly(s);
          });
          new Marker({ element: el, anchor: "center", offset: [Math.round(Math.cos(angle) * ringRadius), Math.round(Math.sin(angle) * ringRadius)] }).setLngLat(s.lngLat).addTo(map);
        });
      }

      map.on("load", () => onReady?.());
      map.on("moveend", () => setZoomedIn(map.getZoom() > 3));
      map.on("error", (e: ErrorEvent) => {
        if (!hint) setHint("map tiles unavailable right now");
        console.warn("map", e.error?.message);
      });

      // One click arms the map: from then on the wheel zooms it. Leaving it, or Escape, hands the wheel back to the page.
      const arm = () => {
        map.scrollZoom.enable();
        setArmed(true);
      };
      const disarm = () => {
        map.scrollZoom.disable();
        setArmed(false);
      };
      const el = box.current;
      el.addEventListener("click", arm);
      el.addEventListener("mouseleave", disarm);
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && disarm();
      window.addEventListener("keydown", onKey);

      return () => {
        el.removeEventListener("click", arm);
        el.removeEventListener("mouseleave", disarm);
        window.removeEventListener("keydown", onKey);
        map.remove();
        mapRef.current = null;
      };
    } catch (err) {
      console.error("map-init-failed", err);
      setHint("map could not start: " + (err instanceof Error ? err.message : String(err)));
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => mapRef.current?.flyTo({ center: WORLD.center, zoom: WORLD.zoom, pitch: 0, bearing: 0, duration: 1800, essential: true });

  return (
    <div className="livemap" style={{ height }}>
      <div ref={box} className="livemap-canvas" />
      <div className={`livemap-arm ${armed || zoomedIn ? "livemap-arm-off" : ""}`} aria-hidden="true">
        <span>click the map to explore</span>
      </div>
      <div className="livemap-ui" aria-hidden={!zoomedIn}>
        <button type="button" className={`livemap-reset ${zoomedIn ? "livemap-reset-on" : ""}`} onClick={reset}>
          ← back to the world
        </button>
      </div>
      <p className="livemap-hint mono">{hint ?? (armed ? "scroll to zoom · drag to move · right-drag to tilt · click a brand to dive" : "every icon is a photo someone took there · click one to dive into its streets")}</p>
    </div>
  );
}
