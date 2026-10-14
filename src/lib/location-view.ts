// How a location should be described to a reviewer.
//
// There are four states, and collapsing them into two is what let the incident page say "No
// location established" directly beneath a title reading "Flood near devighat bidhhur". Having a
// position on the map and being able to name the place are different things, as
// `incidents/service.ts` already notes. So is being *named but not placed*: the reporter did tell
// us where, and the gazetteer simply does not know that name. A reviewer deciding what to do next
// needs to know which of those they are looking at, because they lead to different actions — one
// can be drawn and distance-checked, one has to be asked about or placed by hand, and one means
// the report was never compared with anything by distance at all.

import type { Claim, Incident, Report } from "@/lib/domain/schemas";
import { reportPoint } from "@/lib/matching/candidates";

export type LocationKind = "mapped" | "approximate" | "named" | "unknown";

export interface LocationView {
  kind: LocationKind;
  /** The place as the reporter wrote it, when they wrote one. */
  name?: string;
  lat?: number;
  lng?: number;
  uncertaintyM?: number;
}

function viewOf(
  point: { lat: number; lng: number; uncertaintyM: number; source: string } | null,
  name: string | undefined,
): LocationView {
  if (point) {
    return {
      kind: point.source === "gazetteer" ? "approximate" : "mapped",
      ...(name ? { name } : {}),
      lat: point.lat,
      lng: point.lng,
      uncertaintyM: point.uncertaintyM,
    };
  }
  return name ? { kind: "named", name } : { kind: "unknown" };
}

/** What one report gives us: its own GPS or pin, else a place name the gazetteer recognised. */
export function reportLocationView(report: Report, claims: Claim[] = []): LocationView {
  return viewOf(reportPoint(report, claims), report.location.placeText?.trim() || undefined);
}

/**
 * An incident's position is the one its founding report established, so a `gazetteer` source here
 * means the position came from a name rather than a measurement. With no position at all, fall
 * back to naming the place: a member report usually typed one, and losing that to "Not established"
 * discards the only thing the reporter actually told us.
 */
export function incidentLocationView(incident: Incident, reports: Report[] = []): LocationView {
  const name = reports.map((r) => r.location.placeText?.trim()).find(Boolean);
  return viewOf(incident.location ?? null, name);
}

const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km` : `${Math.round(m)} m`);

export interface LocationDescription {
  /** The position or the name — what the reader looks at first. */
  headline: string;
  /** A few words for dense rows and map legends. */
  qualifier: string;
  /** A sentence for a card with room to explain, saying what this state does *not* establish. */
  note: string;
}

/**
 * Kept in one place so every screen words these the same way. The notes spell out what each state
 * does *not* establish, because "we could not place this" and "this was never compared by
 * distance" are the facts a reviewer actually acts on.
 */
export function describeLocation(view: LocationView): LocationDescription {
  switch (view.kind) {
    case "mapped":
      return {
        headline: `${view.lat!.toFixed(4)}, ${view.lng!.toFixed(4)}`,
        qualifier: `measured position, ±${metres(view.uncertaintyM ?? 0)}`,
        note: `A position the device measured, accurate to about ±${metres(view.uncertaintyM ?? 0)}.`,
      };
    case "approximate":
      return {
        headline: view.name ?? `${view.lat!.toFixed(4)}, ${view.lng!.toFixed(4)}`,
        qualifier: `approximate, from the place name, ±${metres(view.uncertaintyM ?? 0)}`,
        note: `Matched to a known place of that name, good to about ±${metres(view.uncertaintyM ?? 0)}. An approximate position, not a measured one.`,
      };
    case "named":
      return {
        headline: view.name!,
        qualifier: "named by the reporter, not on our map",
        note: "The reporter named this place, but it is not in our map data, so there is no position for it: it cannot be drawn, and the report was not compared with others by distance.",
      };
    default:
      return {
        headline: "Not given",
        qualifier: "no location in the report",
        note: "The report carried no location, so it was not compared with others by distance.",
      };
  }
}

/** Short form for a strip or a table cell, where the note is shown separately or not at all. */
export function locationHeadline(view: LocationView): string {
  return describeLocation(view).headline;
}
