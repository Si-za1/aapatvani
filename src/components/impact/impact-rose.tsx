// What the road analysis found, and which way it lies.
//
// The map answers "where on the roads". This answers the other half of the same question: how far
// out does this reach, and in which directions, which a road map makes you trace with a finger. The
// incident sits at the middle, distance rings around it, and every place the analysis flagged is
// plotted at its true bearing and its true distance, so the shape of the harm is one glance.
//
// **Severity is one hue in three shades, not three hues.** The findings are ordered — a place with
// no route left matters more than a place whose route grew, which matters more than a school that
// happens to be nearby — and an ordered scale is a sequential ramp. Three hues here would be a
// categorical palette pretending the categories were unrelated, and would also break the rule that
// all-pairs forms cap at three colours before they stop being tellable apart.
//
// Shape carries the other axis, so nothing depends on shade alone: a circle is a settlement, a
// square is a health facility, a diamond is anything else the analysis noticed.

import { haversineM } from "@/lib/geo/math";
import type { ImpactCandidate } from "@/lib/domain/schemas";

const SIZE = 320;
const CENTRE = SIZE / 2;
const MAX_R = 132;
/** Ring distances, in km. The plot is square-root spaced, so these are the labels that matter. */
const RING_KM = [1, 2, 5, 10, 20, 30, 50, 100, 200];

/** Severity, darkest first. One hue, three steps. */
const SEVERITY = [
  { key: "lost_access", label: "Loses its route to care", fill: "#4c5a1c" },
  { key: "longer_route", label: "Route to care grows", fill: "#8aa03c" },
  { key: "context", label: "Affected another way", fill: "#b9cd7a" },
] as const;

type SeverityKey = (typeof SEVERITY)[number]["key"];

function severityOf(finding: ImpactCandidate["finding"]): SeverityKey {
  if (finding === "lost_access") return "lost_access";
  if (finding === "longer_route") return "longer_route";
  return "context";
}

/** Compass bearing from one point to another, in degrees clockwise from north. */
function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const φ1 = (aLat * Math.PI) / 180;
  const φ2 = (bLat * Math.PI) / 180;
  const Δλ = ((bLng - aLng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** A round ceiling for the rings, from the distances that people actually use. */
function niceCeiling(metres: number): number {
  const km = metres / 1000;
  for (const step of [1, 2, 5, 10, 20, 30, 50, 100, 200]) if (km <= step) return step * 1000;
  return Math.ceil(km / 100) * 100 * 1000;
}

const SHAPES = [
  { key: "settlement_access", label: "A place", shape: "circle" },
  { key: "facility_access", label: "A health facility", shape: "square" },
  { key: "nearby_asset", label: "Something else nearby", shape: "diamond" },
] as const;

/**
 * Two decimals, because the browser and the server do not agree on the last one. `Math.sin` of the
 * same bearing came out as 131.82159610371366 on one side and …363 on the other, which is enough for
 * React to throw the tree away and rebuild it on every load. A 320-unit drawing does not need
 * fourteen decimal places, and rounding here also makes the markup half the size.
 */
const px = (value: number) => Math.round(value * 100) / 100;

function markerPath(shape: string, x: number, y: number, r: number): string {
  if (shape === "square") {
    const s = r * 0.5;
    return `M${x - r} ${y - s}h${r * 2}v${s * 2}h${-r * 2}z`;
  }
  if (shape === "diamond") return `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}z`;
  return `M${x} ${y}m${-r} 0a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
}

export function ImpactRose({
  centre,
  candidates,
  className,
}: {
  centre: { lat: number; lng: number };
  candidates: ImpactCandidate[];
  className?: string;
}) {
  const places = candidates
    .filter((candidate) => candidate.kind !== "road_segment")
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      kind: candidate.kind as (typeof SHAPES)[number]["key"],
      severity: severityOf(candidate.finding),
      distanceM: candidate.metrics.distanceToIncidentM ?? haversineM(centre.lat, centre.lng, candidate.lat, candidate.lng),
      bearing: bearingDeg(centre.lat, centre.lng, candidate.lat, candidate.lng),
    }))
    .sort((a, b) => b.distanceM - a.distanceM);

  if (places.length === 0) return null;

  const ceiling = niceCeiling(Math.max(...places.map((place) => place.distanceM)));
  // Square-root spacing, and the rings are labelled with their real distance so the compression is
  // declared rather than hidden. On a linear scale a single place 20 km out squashes everything
  // within five into an unreadable knot at the middle, which is where all the findings are.
  const radiusOf = (metres: number) => MAX_R * Math.sqrt(Math.min(metres, ceiling) / ceiling);

  const counts = new Map<SeverityKey, number>();
  for (const place of places) counts.set(place.severity, (counts.get(place.severity) ?? 0) + 1);
  const kindsPresent = SHAPES.filter((shape) => places.some((place) => place.kind === shape.key));

  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block w-full max-w-[22rem]" role="img"
        aria-label={`The incident at the centre, with ${places.length} findings around it by distance and direction.`}>
        {/* Distance rings, with their radius said out loud rather than left to a scale bar. */}
        {RING_KM.filter((km) => km * 1000 <= ceiling).map((km) => {
          const r = radiusOf(km * 1000);
          return (
            <g key={km}>
              <circle cx={CENTRE} cy={CENTRE} r={r} fill="none" stroke="var(--border)" strokeWidth={1} />
              <text x={CENTRE + 4} y={CENTRE - r + 11} className="fill-muted-foreground text-[9px] tabular-nums">
                {km} km
              </text>
            </g>
          );
        })}

        {/* North first, then round: a compass this chart can be read against. */}
        {(
          [
            ["N", 0, -1],
            ["E", 1, 0],
            ["S", 0, 1],
            ["W", -1, 0],
          ] as const
        ).map(([label, dx, dy]) => (
          <text
            key={label}
            x={CENTRE + dx * (MAX_R + 13)}
            y={CENTRE + dy * (MAX_R + 13) + 3}
            textAnchor="middle"
            className="fill-muted-foreground text-[9px] font-semibold"
          >
            {label}
          </text>
        ))}

        {places.map((place) => {
          const radians = (place.bearing * Math.PI) / 180;
          const r = radiusOf(place.distanceM);
          const x = px(CENTRE + r * Math.sin(radians));
          const y = px(CENTRE - r * Math.cos(radians));
          const shape = SHAPES.find((entry) => entry.key === place.kind)?.shape ?? "circle";
          const fill = SEVERITY.find((entry) => entry.key === place.severity)?.fill ?? "#8aa03c";
          return (
            <g key={place.id}>
              {/* One string, not a run of text nodes: inside an SVG title the browser parses what
                  the server wrote differently from what React builds on the client, and a facility
                  called "… & Research Centre" is enough to make the whole tree mismatch. */}
              <title>{`${place.name} · ${Math.round(place.distanceM / 1000)} km ${compass(place.bearing)}`}</title>
              <path d={markerPath(shape, x, y, 6)} fill={fill} stroke="var(--card)" strokeWidth={2} />
            </g>
          );
        })}

        {/* The incident itself, last so it sits on top of everything it caused. */}
        <circle cx={CENTRE} cy={CENTRE} r={7} fill="var(--av-ink)" stroke="var(--card)" strokeWidth={3} />
      </svg>

      <figcaption className="mt-3 flex flex-col gap-2.5">
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          {SEVERITY.filter((step) => (counts.get(step.key) ?? 0) > 0).map((step) => (
            <li key={step.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full ring-1 ring-card" style={{ background: step.fill }} />
              {step.label}
              <span className="tabular-nums opacity-70">{counts.get(step.key)}</span>
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          {kindsPresent.map((shape) => (
            <li key={shape.key} className="inline-flex items-center gap-1.5">
              <svg viewBox="-7 -7 14 14" className="size-3" aria-hidden>
                <path
                  d={markerPath(shape.shape, 0, 0, 5)}
                  className="fill-stone-strong"
                  stroke="var(--card)"
                  strokeWidth={1.5}
                />
              </svg>
              {shape.label}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-ink ring-1 ring-card" />
            Where it was reported
          </li>
        </ul>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Distance and direction are measured in a straight line from the reported location, out to the
          outermost ring at {Math.round(ceiling / 1000)} km. The rings are spaced by the square root of
          distance, so the near field where the findings are is not crushed into the middle — read the
          labels, not the gaps. Nothing here says a place is safe because it is outside.
        </p>
      </figcaption>
    </figure>
  );
}

/** "NW", "SSE": the words a person would use for a direction. */
function compass(bearing: number): string {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16];
}
