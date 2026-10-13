// Where each piece of evidence sits along the line.
//
// The horizontal timeline is the one place in this app where geography is replaced by time, and time
// is not evenly spaced: six reports can arrive in an afternoon and then nothing for a week. So a
// marker's position is its share of the span, with a floor underneath it. Two markers a minute apart
// would otherwise sit on top of each other and read as one event, and a timeline that silently
// merges two events is worse than one that spreads them out and says so by the spacing.
//
// Pure, and tested, because it is arithmetic with a floor in it and the failure mode is quiet.

import type { TimelineEntry } from "./types";
import { KIND_ORDER } from "./types";

/** One marker's column. Wide enough for a reference code and two lines of a label. */
export const SLOT = 186;
/** The least distance between two markers, so nothing ever overlaps. */
export const MIN_GAP = 194;
/** The margin before the first marker and after the last. */
export const LEAD = 16;
/** The narrowest the line is ever drawn, so a quiet day still reads as a timeline. */
export const AXIS_WIDTH = 1180;
/** The lane above the line, where what the community reported sits. */
export const ABOVE_LANE = 118;

export interface AxisMarker {
  /** The moment, which is also the key. */
  key: string;
  at: string;
  x: number;
  /** The community's report at this moment, if one arrived. Above the line. */
  above?: TimelineEntry;
  /** Everything done about it at this moment, in chain order. Below the line. */
  below: TimelineEntry[];
}

export interface AxisLayout {
  markers: AxisMarker[];
  /** How wide the drawn line needs to be. Never less than the nominal width. */
  width: number;
  /** The deepest stack below the line, so the block can be given the room it needs. */
  depth: number;
}

export function layoutAxis(entries: TimelineEntry[], width = AXIS_WIDTH): AxisLayout {
  const sorted = [...entries].sort(
    (a, b) => a.at.localeCompare(b.at) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );

  // One marker per moment, and a moment is a minute: an ISO timestamp cut to the minute is the same
  // string as the clock the reader sees. A report and the model that read it four hundred
  // milliseconds later are one position, because they are one moment, and lumping them is also what
  // stops a busy second from drawing as ten markers on top of each other.
  const buckets = new Map<string, TimelineEntry[]>();
  for (const entry of sorted) {
    const minute = entry.at.slice(0, 16);
    const bucket = buckets.get(minute);
    if (bucket) bucket.push(entry);
    else buckets.set(minute, [entry]);
  }

  // Every moment, oldest first, carrying the earliest real timestamp in its bucket: the marker is
  // labelled and placed by when it happened, not by the minute it was rounded into. The distance
  // arithmetic below runs on those timestamps and never on the keys, because a key like
  // "2026-07-14T07:15" has no time zone in it and `Date.parse` would read it as the browser's local
  // time, which is a different instant from the same clock reading in Kathmandu.
  const moments = [...buckets.entries()]
    .map(([minute, items]) => ({ key: minute, at: items[0]?.at ?? minute, items }))
    .sort((a, b) => a.at.localeCompare(b.at));

  const first = moments.length ? Date.parse(moments[0].at) : Number.NaN;
  const last = moments.length ? Date.parse(moments[moments.length - 1].at) : Number.NaN;
  const span = Number.isFinite(first) && Number.isFinite(last) && last > first ? last - first : 0;
  const travel = Math.max(0, width - LEAD - SLOT);

  let cursor = Number.NEGATIVE_INFINITY;
  const markers = moments.map(({ key, at, items }) => {
    const parsed = Date.parse(at);
    const fraction = span > 0 && Number.isFinite(parsed) ? (parsed - first) / span : 0;
    const x = Math.max(LEAD + fraction * travel, cursor + MIN_GAP);
    cursor = x;

    const above = items.find((entry) => entry.kind === "report");
    return { key, at, x, above, below: items.filter((entry) => entry !== above) };
  });

  const depth = markers.reduce((most, marker) => Math.max(most, marker.below.length), 0);
  const right = markers.length ? markers[markers.length - 1].x + SLOT + LEAD : LEAD;

  return { markers, width: Math.max(width, right), depth };
}
