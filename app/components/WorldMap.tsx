import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import world from "world-atlas/countries-110m.json";
import { cityCoords } from "@/lib/cities";

/**
 * A pencil-drawn world map: land in worn paper with a fine hatch, coastlines in pencil, the sea left
 * as the notebook's grid. Sightings are pinned by city (never finer). Rendered on the server as SVG.
 */
const W = 1000;
const H = 480;
const LON0 = -180;
const LON1 = 180;
const LAT0 = -56;
const LAT1 = 84;

function project([lon, lat]: [number, number]): [number, number] {
  const x = ((lon - LON0) / (LON1 - LON0)) * W;
  const y = ((LAT1 - lat) / (LAT1 - LAT0)) * H;
  return [x, y];
}

let cached: string | null = null;
function landPath(): string {
  if (cached) return cached;
  const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
  const fc = feature(topo, topo.objects.countries);
  const parts: string[] = [];
  for (const f of fc.features as Feature<Polygon | MultiPolygon>[]) {
    if (String(f.id) === "010") continue; // Antarctica: below the map, would only draw a stray edge
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      for (const ring of poly) {
        // a ring that crosses the antimeridian is split into separate strokes instead of a line across the map
        let d = "";
        let prevLon = Number.NaN;
        for (let i = 0; i < ring.length; i++) {
          const pt = ring[i] as [number, number];
          const [x, y] = project(pt);
          const jump = Math.abs(pt[0] - prevLon) > 180;
          d += `${i === 0 || jump ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
          prevLon = pt[0];
        }
        parts.push(d);
      }
    }
  }
  cached = parts.join("");
  return cached;
}

export interface MapPin {
  city: string;
  label?: string;
  hot?: boolean;
}

export function WorldMap({ pins, height = 420, className }: { pins: MapPin[]; height?: number; className?: string }) {
  const d = landPath();
  const points = pins
    .map((p) => {
      const c = cityCoords(p.city);
      return c ? { ...p, xy: project(c) } : null;
    })
    .filter(Boolean) as (MapPin & { xy: [number, number] })[];
  // group pins by city so a busy city reads as one bigger mark
  const byCity = new Map<string, { xy: [number, number]; n: number; hot: boolean }>();
  for (const p of points) {
    const e = byCity.get(p.city) ?? { xy: p.xy, n: 0, hot: false };
    e.n += 1;
    e.hot = e.hot || Boolean(p.hot);
    byCity.set(p.city, e);
  }
  // labels: biggest cities first, and a label is dropped when it would sit on another one
  const labelled: [number, number][] = [];
  const entries = [...byCity.entries()].sort((a, b) => b[1].n - a[1].n);
  const showLabel = (xy: [number, number]) => {
    const ok = labelled.every(([x, y]) => Math.abs(x - xy[0]) > 92 || Math.abs(y - xy[1]) > 18);
    if (ok) labelled.push(xy);
    return ok;
  };
  return (
    <div className={`worldmap ${className ?? ""}`} style={{ height }} role="img" aria-label={`Field map, ${byCity.size} cities with sightings`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--pencil)" strokeWidth="0.5" opacity="0.35" />
          </pattern>
          <filter id="pencil" x="-2%" y="-2%" width="104%" height="104%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4" />
          </filter>
        <clipPath id="mapclip">
            <rect x="0" y="0" width={W} height={H} />
          </clipPath>
        </defs>
        <g clipPath="url(#mapclip)">
          <path d={d} fill="var(--map-land)" stroke="var(--map-stroke)" strokeWidth="0.8" strokeLinejoin="round" />
        </g>
        {entries.map(([city, e]) => (
          <g key={city} transform={`translate(${e.xy[0].toFixed(1)} ${e.xy[1].toFixed(1)})`} className="map-pin">
            <circle r={e.hot ? 14 : 10} fill="var(--accent)" opacity="0.25" className="map-pin-halo" />
            <circle r={3.4 + Math.min(4, e.n)} fill="var(--accent)" stroke="#fff" strokeWidth="2" />
            {showLabel(e.xy) && (
              <text x="10" y="4" fontSize="12" fill="var(--text)">
                {city.split(",")[0]}
                {e.n > 1 ? ` ×${e.n}` : ""}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
