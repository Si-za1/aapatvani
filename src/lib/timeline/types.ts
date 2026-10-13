// The timeline's vocabulary, in its own module because three places need it and only one of them
// may touch the store: the service that builds entries, the grouping that buckets them, and the
// layout that places them on an axis.

import type { Actor } from "@/lib/domain/schemas";

export type TimelineKind = "report" | "read" | "review" | "incident" | "impact" | "alert";

export interface TimelineEntry {
  id: string;
  /** When this entered the record. */
  at: string;
  kind: TimelineKind;
  /** Who produced it, using the same four kinds the trust model does. */
  actor: Actor["kind"];
  title: string;
  detail?: string;
  /** The reporter's verbatim words, when the entry rests on them. */
  quote?: string;
  /** What this entry is about, for the line under it. A reference code or a title. */
  about?: string;
  href?: string;
  /** The hazard category this entry belongs to, for the filter. */
  hazard?: string;
}

export interface TimelineData {
  entries: TimelineEntry[];
  /** Categories present in the data, with how many entries each has. */
  categories: Array<{ id: string; count: number }>;
  /** When this picture was taken, so the grouping can say "today" without reading the clock again. */
  generatedAt: string;
}

/**
 * The order of the chain when two entries share a moment. A report, then the model reading it, then
 * a person deciding. Sorted by this rather than left to insertion order, which is a detail of how
 * the entries happen to be built rather than a property of the evidence.
 */
export const KIND_ORDER: Record<TimelineKind, number> = {
  report: 0,
  read: 1,
  review: 2,
  incident: 3,
  impact: 4,
  alert: 5,
};
