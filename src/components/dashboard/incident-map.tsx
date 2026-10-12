"use client";

// The incident map (feature M10). Loaded client-only and on demand: Leaflet needs `window`, and the
// list beside it is usable long before the tiles arrive.
//
// The design rule from project.md §3 rule 5 is that reported locations, impact candidates and
// confirmed information must stay visually distinct, and rule that every colour is paired with an
// icon and a text label — hence the legend, which names each shape rather than relying on the map
// alone.

import { divIcon } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { ClientOnlyMap } from "@/components/av/client-only-map";
import type { MapPoint } from "@/lib/dashboard/service";

const TONE_STYLE: Record<MapPoint["tone"], { fill: string; ring: string; label: string; shape: "circle" | "square" }> = {
  verified: { fill: "#3e4a15", ring: "#b2bc75", label: "Verified incident", shape: "circle" },
  candidate: { fill: "#6e5200", ring: "#f5d565", label: "Candidate incident", shape: "circle" },
  dismissed: { fill: "#5b5448", ring: "#ddd5c6", label: "Dismissed", shape: "circle" },
  report: { fill: "#7e2452", ring: "#f2b9d3", label: "Report not yet grouped", shape: "square" },
};

/**
 * Markers are divIcons: Leaflet's default marker resolves a PNG by a relative URL that bundlers
 * rewrite, and it 404s in production. Shape carries meaning too — square for a loose report, round
 * for an incident — so the two layers are tellable apart without colour.
 */
const icons = Object.fromEntries(
  Object.entries(TONE_STYLE).map(([tone, style]) => [
    tone,
    divIcon({
      className: "av-div-icon",
      html:
        style.shape === "circle"
          ? `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${style.fill};box-shadow:0 0 0 3px ${style.ring},0 1px 5px rgba(22,48,46,.45)"></span>`
          : `<span style="display:block;width:13px;height:13px;border-radius:3px;background:${style.fill};box-shadow:0 0 0 3px ${style.ring},0 1px 5px rgba(22,48,46,.45)"></span>`,
      iconSize: style.shape === "circle" ? [16, 16] : [13, 13],
      iconAnchor: style.shape === "circle" ? [8, 8] : [6.5, 6.5],
    }),
  ]),
) as Record<MapPoint["tone"], ReturnType<typeof divIcon>>;

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
      <div className={`av-map overflow-hidden rounded-2xl border border-border ${className ?? "h-[26rem]"}`}>
      <ClientOnlyMap
        placeholder={<div className="h-full w-full animate-pulse bg-sand" aria-hidden />}
      >
        <MapContainer center={center} zoom={zoom} scrollWheelZoom className="h-full w-full">
          <TileLayer url={tileUrl} attribution={attribution} />
          {points.map((point) => (
            <Marker key={point.id} position={[point.lat, point.lng]} icon={icons[point.tone]}>
              <Popup>
                <strong className="block text-[13px]">{point.label}</strong>
                <span className="block text-xs text-muted-foreground">{TONE_STYLE[point.tone].label}</span>
                <span className="block text-xs">{point.detail}</span>
                <a className="mt-1 inline-block text-xs font-medium underline" href={point.href}>
                  Open
                </a>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </ClientOnlyMap>
      </div>

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
