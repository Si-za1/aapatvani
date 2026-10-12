"use client";

// The Blast Radius on the map (features M9/M10). This is the picture the whole product is for:
// which settlements keep a road route to a health facility, and which lose one.
//
// Everything drawn here is *computed* from the road dataset, so it is tinted river teal and labelled
// as such. The map never shows a flood extent, a runout or a damage estimate — it shows which
// mapped routes change when one segment is assumed blocked.

import { divIcon } from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip } from "react-leaflet";
import { ClientOnlyMap } from "@/components/av/client-only-map";
import type { ImpactAssessment, ImpactCandidate } from "@/lib/domain/schemas";

/** Candidate findings, each with its own shape and words. Colour never stands alone. */
const FINDING_STYLE: Record<
  ImpactCandidate["finding"],
  { label: string; stroke: string; fill: string; radius: number }
> = {
  possibly_blocked: { label: "Road possibly blocked", stroke: "#1b5950", fill: "#9dcfc4", radius: 9 },
  lost_access: { label: "Loses road access to care", stroke: "#7e2452", fill: "#f2b9d3", radius: 8 },
  longer_route: { label: "Route to care much longer", stroke: "#6e5200", fill: "#f5d565", radius: 7 },
  catchment_affected: { label: "Health facility whose catchment changed", stroke: "#2c4185", fill: "#b8c7ef", radius: 7 },
  nearby: { label: "Nearby — not assumed affected", stroke: "#5b5448", fill: "#ddd5c6", radius: 5 },
};

const INCIDENT_ICON = divIcon({
  className: "av-div-icon",
  html: '<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#16302e;box-shadow:0 0 0 3px #faf4e8,0 1px 6px rgba(22,48,46,.55)"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

/** Flat [lat, lng, …] into the pairs Leaflet wants. */
function toPositions(flat: number[] | undefined): Array<[number, number]> {
  if (!flat?.length) return [];
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

export interface ImpactMapProps {
  assessment: ImpactAssessment;
  incident: { lat: number; lng: number; label: string };
  center: [number, number];
  zoom: number;
  tileUrl: string;
  attribution: string;
  className?: string;
}

export default function ImpactMap({ assessment, incident, center, zoom, tileUrl, attribution, className }: ImpactMapProps) {
  const shown = assessment.candidates.filter((c) => c.review.status !== "rejected");
  const findings = [...new Set(shown.map((c) => c.finding))];

  return (
    <div className="flex flex-col gap-2">
      <div className={`av-map overflow-hidden rounded-2xl border border-border ${className ?? "h-[24rem]"}`}>
        <ClientOnlyMap placeholder={<div className="h-full w-full animate-pulse bg-sand" aria-hidden />}>
          <MapContainer center={center} zoom={zoom} scrollWheelZoom className="h-full w-full">
            <TileLayer url={tileUrl} attribution={attribution} />

            {/* The assumed blocked segment: the only thing here that is an assumption, not a measurement. */}
            {assessment.blockedRoads.map((road) => {
              const candidate = shown.find((c) => c.kind === "road_segment" && c.edgeIds?.includes(road.edge));
              const positions = toPositions(candidate?.geometry);
              if (positions.length < 2) return null;
              return (
                <Polyline
                  key={`blocked-${road.edge}`}
                  positions={positions}
                  pathOptions={{ color: "#16302e", weight: 6, opacity: 0.75, dashArray: "1 7", lineCap: "round" }}
                >
                  <Tooltip>
                    Assumed blocked: {road.name} ({Math.round(road.lengthM)} m)
                  </Tooltip>
                </Polyline>
              );
            })}

            {/* Baseline routes to care for the places that keep one: context for what changed. */}
            {shown
              .filter((c) => c.kind === "settlement_access" && c.finding === "longer_route")
              .slice(0, 12)
              .map((candidate) => (
                <Polyline
                  key={`route-${candidate.id}`}
                  positions={toPositions(candidate.geometry)}
                  pathOptions={{ color: "#6e5200", weight: 3, opacity: 0.5 }}
                />
              ))}

            {shown.map((candidate) => {
              const style = FINDING_STYLE[candidate.finding];
              const reviewed = candidate.review.status === "confirmed";
              return (
                <CircleMarker
                  key={candidate.id}
                  center={[candidate.lat, candidate.lng]}
                  radius={style.radius}
                  pathOptions={{
                    color: style.stroke,
                    fillColor: style.fill,
                    fillOpacity: reviewed ? 0.95 : 0.6,
                    weight: reviewed ? 3 : 1.5,
                  }}
                >
                  <Popup>
                    <strong className="block text-[13px]">{candidate.name}</strong>
                    <span className="block text-xs text-muted-foreground">{style.label}</span>
                    <span className="block text-xs">{candidate.explanation}</span>
                    <span className="mt-1 block text-xs">
                      {reviewed ? "Confirmed by a reviewer" : candidate.review.status === "unreviewed" ? "Not yet reviewed" : candidate.review.status}
                    </span>
                  </Popup>
                </CircleMarker>
              );
            })}

            <Marker position={[incident.lat, incident.lng]} icon={INCIDENT_ICON}>
              <Popup>
                <strong className="block text-[13px]">{incident.label}</strong>
                <span className="block text-xs text-muted-foreground">Reported incident location</span>
              </Popup>
            </Marker>
          </MapContainer>
        </ClientOnlyMap>
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-full bg-ink" style={{ boxShadow: "0 0 0 2px #faf4e8" }} />
          Incident location
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-5 rounded-full bg-ink/70" style={{ borderTop: "2px dashed #16302e" }} />
          Road assumed blocked
        </li>
        {findings.map((finding) => {
          const style = FINDING_STYLE[finding];
          return (
            <li key={finding} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-3 rounded-full"
                style={{ background: style.fill, boxShadow: `0 0 0 1.5px ${style.stroke}` }}
              />
              {style.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
