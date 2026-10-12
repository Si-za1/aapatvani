"use client";

// The incident map (feature M10). Loaded client-only and on demand: Leaflet needs `window`, and the
// list beside it is usable long before the tiles arrive.
//
// The design rule from project.md §3 rule 5 is that reported locations, impact candidates and
// confirmed information must stay visually distinct, and every colour is paired with an icon and a
// text label — hence the legend, which names each shape rather than relying on the map alone.

import * as L from "leaflet";
import { LeafletMap, popupHtml } from "@/components/av/leaflet-map";
import type { MapPoint } from "@/lib/dashboard/service";

const TONE_STYLE: Record<MapPoint["tone"], { fill: string; ring: string; label: string; shape: "circle" | "square" }> = {
  verified: { fill: "#3e4a15", ring: "#b2bc75", label: "Verified incident", shape: "circle" },
  candidate: { fill: "#6e5200", ring: "#f5d565", label: "Candidate incident", shape: "circle" },
  dismissed: { fill: "#5b5448", ring: "#ddd5c6", label: "Dismissed", shape: "circle" },
  report: { fill: "#7e2452", ring: "#f2b9d3", label: "Report not yet grouped", shape: "square" },
};

/**
 * Markers are hand-built rather than Leaflet's default: the default icon resolves a PNG by a
 * relative URL that bundlers rewrite, and it 404s in production. Shape carries meaning too — square
 * for a loose report, round for an incident — so the two layers are tellable apart without colour.
 */
function markerIcon(tone: MapPoint["tone"]): L.DivIcon {
  const style = TONE_STYLE[tone];
  const size = style.shape === "circle" ? 16 : 13;
  const radius = style.shape === "circle" ? "9999px" : "3px";
  return L.divIcon({
    className: "av-div-icon",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:${radius};background:${style.fill};box-shadow:0 0 0 3px ${style.ring},0 1px 5px rgba(22,48,46,.45)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const ICONS = Object.fromEntries(
  (Object.keys(TONE_STYLE) as MapPoint["tone"][]).map((tone) => [tone, markerIcon(tone)]),
) as Record<MapPoint["tone"], L.DivIcon>;

export interface IncidentMapProps {
  points: MapPoint[];
  center: [number, number];
  zoom: number;
  tileUrl: string;
  attribution: string;
  className?: string;
}

export default function IncidentMap({ points, center, zoom, tileUrl, attribution, className }: IncidentMapProps) {
  const tones = [...new Set(points.map((p) => p.tone))];

  return (
    <div className="flex flex-col gap-2">
      <LeafletMap
        center={center}
        zoom={zoom}
        tileUrl={tileUrl}
        attribution={attribution}
        className={`av-map overflow-hidden rounded-2xl border border-border ${className ?? "h-[26rem]"}`}
        drawKey={points.map((p) => `${p.id}:${p.tone}`).join("|")}
        draw={(group) => {
          for (const point of points) {
            L.marker([point.lat, point.lng], { icon: ICONS[point.tone] })
              .bindPopup(
                popupHtml({
                  title: point.label,
                  kind: TONE_STYLE[point.tone].label,
                  detail: point.detail,
                  href: point.href,
                  hrefLabel: "Open",
                }),
              )
              .addTo(group);
          }
        }}
      />

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {(tones.length ? tones : (["candidate", "verified", "report"] as MapPoint["tone"][])).map((tone) => {
          const style = TONE_STYLE[tone];
          return (
            <li key={tone} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={style.shape === "circle" ? "size-3 rounded-full" : "size-2.5 rounded-[3px]"}
                style={{ background: style.fill, boxShadow: `0 0 0 2px ${style.ring}` }}
              />
              {style.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
