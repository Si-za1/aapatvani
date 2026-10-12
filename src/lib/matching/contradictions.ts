// Contradiction detection (project.md §8.3). Two independent kinds of check:
//
//   • rules  — deterministic field conflicts over the structured claims (this file)
//   • Gemini — semantic conflicts such as "road fully blocked" vs "one lane open"
//
// Everything here is a *flag for a reviewer*. Nothing is resolved automatically, and a flag is not a
// statement about which report is right. Contradictions are only looked for between reports that
// already sit in the same incident (by system suggestion or reviewer action): two reports that were
// never linked are simply two different events, not a contradiction.
//
// The hazard rule is therefore mainly a guard on human merges — the candidate filter already keeps
// reports with incompatible hazards from being suggested as one incident.

import type { Claim, ContradictionKind, Report } from "@/lib/domain/schemas";
import { roadNamesMatch } from "@/lib/geo/blast-radius";
import { haversineM } from "@/lib/geo/math";
import { stableId } from "@/lib/ids";
import { hoursBetween } from "@/lib/time";
import type { PairFeatures, ReportPoint } from "./candidates";

/** Locations must differ by more than both uncertainty radii plus this to count as a conflict. */
export const LOCATION_GAP_EXTRA_M = 1_000;
/** Reported event times further apart than this are a conflict. */
export const TIME_GAP_HOURS = 6;
/** A photo taken at least this long before the report was submitted is flagged. */
export const EXIF_TIME_OLDER_HOURS = 24;
/** A photo taken further than this from the reported location is flagged. */
export const EXIF_LOCATION_FAR_M = 5_000;

/** Road statuses that mean "you cannot drive through" — the opposite of `passable`. */
const OBSTRUCTED = new Set(["blocked", "partially_blocked", "damaged"]);

export interface ContradictionDraft {
  kind: ContradictionKind;
  detectedBy: "rule" | "ai";
  description: string;
  reportIds: string[];
  claimIds: string[];
  model?: string;
}

export interface ReportContext {
  report: Report;
  claims: Claim[];
  point: ReportPoint | null;
}

function reportIdsOf(draft: ContradictionDraft): string[] {
  return [...draft.reportIds].sort();
}

/**
 * A stable identity for a contradiction, so re-running matching updates a flag rather than
 * duplicating it. Built from what the flag is *about*, not from when it was found.
 */
export function contradictionFingerprint(draft: ContradictionDraft): string {
  return [draft.kind, reportIdsOf(draft).join("+"), [...draft.claimIds].sort().join("+")].join("|");
}

export function contradictionId(draft: ContradictionDraft): string {
  return stableId("con", contradictionFingerprint(draft));
}

const km = (m: number) => `${(m / 1000).toFixed(1)} km`;

// ---------------------------------------------------------------- one report on its own

/**
 * Conflicts between a report and its own attachments: a photo whose EXIF metadata disagrees with
 * what the reporter said. Reused or forwarded photos are common, and reviewers should know.
 */
export function reportSelfContradictions(ctx: ReportContext): ContradictionDraft[] {
  const drafts: ContradictionDraft[] = [];
  const { report } = ctx;

  for (const media of report.media) {
    if (media.kind !== "photo" || !media.exif) continue;

    const takenAt = media.exif.takenAt;
    if (takenAt) {
      const gap = hoursBetween(takenAt, report.submittedAt);
      if (gap >= EXIF_TIME_OLDER_HOURS) {
        drafts.push({
          kind: "photo_time",
          detectedBy: "rule",
          reportIds: [report.id],
          claimIds: [],
          description: `The attached photo was taken about ${Math.round(gap)} h before the report was submitted. It may show an earlier situation.`,
        });
      }
    }

    const gps = media.exif.gps;
    if (gps && ctx.point) {
      const metres = haversineM(gps.lat, gps.lng, ctx.point.lat, ctx.point.lng);
      if (metres > EXIF_LOCATION_FAR_M) {
        drafts.push({
          kind: "photo_location",
          detectedBy: "rule",
          reportIds: [report.id],
          claimIds: [],
          description: `The attached photo's EXIF location is ${km(metres)} from the location given with the report.`,
        });
      }
    }
  }

  return drafts;
}

// ---------------------------------------------------------------- pairs

function timeWindows(claims: Claim[]): Array<{ claim: Claim; start: number; end: number }> {
  const out: Array<{ claim: Claim; start: number; end: number }> = [];
  for (const claim of claims) {
    const t = claim.time;
    if (!t) continue;
    const start = t.interpretedStart ? Date.parse(t.interpretedStart) : NaN;
    const end = t.interpretedEnd ? Date.parse(t.interpretedEnd) : start;
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    out.push({ claim, start, end });
  }
  return out;
}

function roadStatusClaims(claims: Claim[]): Claim[] {
  return claims.filter((c) => c.roadStatus && c.roadStatus !== "unknown");
}

/** Road names line up, or at least one report did not name a road. */
function sameRoad(a: Claim, b: Claim): boolean {
  if (!a.roadName || !b.roadName) return true;
  return roadNamesMatch(a.roadName, b.roadName);
}

/**
 * Field-level conflicts between two reports. Pair checks that overlap with the candidate filter
 * (distance, time) fire in the band where a pair is close enough to consider but far enough to
 * disagree.
 */
export function pairContradictions(a: ReportContext, b: ReportContext, features: PairFeatures): ContradictionDraft[] {
  const drafts: ContradictionDraft[] = [];
  const pair = [a.report.id, b.report.id];

  // Locations further apart than both uncertainty radii plus 1 km.
  if (a.point && b.point) {
    const metres = haversineM(a.point.lat, a.point.lng, b.point.lat, b.point.lng);
    const threshold = a.point.uncertaintyM + b.point.uncertaintyM + LOCATION_GAP_EXTRA_M;
    if (metres > threshold) {
      const placeClaims = [a, b]
        .map((side) => side.claims.find((c) => c.type === "location" && c.place))
        .filter((c): c is Claim => Boolean(c));
      drafts.push({
        kind: "location",
        detectedBy: "rule",
        reportIds: pair,
        claimIds: placeClaims.map((c) => c.id),
        description: `The two reported locations are ${km(metres)} apart — more than their stated accuracy allows for.`,
      });
    }
  }

  // Reported event times more than 6 h apart, counting an interpreted window as a whole.
  const timesA = timeWindows(a.claims);
  const timesB = timeWindows(b.claims);
  let worst: { gapH: number; ca: Claim; cb: Claim } | null = null;
  for (const ta of timesA) {
    for (const tb of timesB) {
      const gapMs = Math.max(ta.start - tb.end, tb.start - ta.end);
      const gapH = gapMs / 3_600_000;
      if (gapH > TIME_GAP_HOURS && (!worst || gapH > worst.gapH)) worst = { gapH, ca: ta.claim, cb: tb.claim };
    }
  }
  if (worst) {
    drafts.push({
      kind: "time",
      detectedBy: "rule",
      reportIds: pair,
      claimIds: [worst.ca.id, worst.cb.id],
      description: `The reported times are about ${Math.round(worst.gapH)} h apart.`,
    });
  }

  // Incompatible hazards (chiefly a guard on a reviewer merging two different events).
  if (features.hazardMatch === "different") {
    const hazardClaims = [a, b].flatMap((side) => side.claims.filter((c) => c.type === "hazard"));
    drafts.push({
      kind: "hazard",
      detectedBy: "rule",
      reportIds: pair,
      claimIds: hazardClaims.map((c) => c.id),
      description: "The reports name hazard types that do not normally occur together.",
    });
  }

  // Conflicting road status: one report says you cannot drive through, the other says it is open.
  const roadsA = roadStatusClaims(a.claims);
  const roadsB = roadStatusClaims(b.claims);
  const blocked = roadsA.filter((c) => OBSTRUCTED.has(c.roadStatus!));
  const open = roadsB.filter((c) => c.roadStatus === "passable");
  const openA = roadsA.filter((c) => c.roadStatus === "passable");
  const blockedB = roadsB.filter((c) => OBSTRUCTED.has(c.roadStatus!));
  const roadPairs: Array<[Claim, Claim]> = [
    ...blocked.flatMap((x) => open.filter((y) => sameRoad(x, y)).map((y): [Claim, Claim] => [x, y])),
    ...openA.flatMap((x) => blockedB.filter((y) => sameRoad(x, y)).map((y): [Claim, Claim] => [x, y])),
  ];
  if (roadPairs.length) {
    const cited = [...new Set(roadPairs.flat())];
    drafts.push({
      kind: "road_status",
      detectedBy: "rule",
      reportIds: pair,
      claimIds: cited.map((c) => c.id),
      description: `One report says the road is ${blocked.length ? "blocked" : "open"} and the other says it is ${blocked.length ? "open" : "blocked"}.`,
    });
  }

  // Conflicting counts of people for the same kind.
  const peopleA = a.claims.filter((c) => c.people?.count !== undefined);
  const peopleB = b.claims.filter((c) => c.people?.count !== undefined);
  const countConflicts: Array<[Claim, Claim]> = [];
  for (const ca of peopleA) {
    for (const cb of peopleB) {
      if (ca.people!.kind === cb.people!.kind && ca.people!.count !== cb.people!.count) countConflicts.push([ca, cb]);
    }
  }
  if (countConflicts.length) {
    const [ca, cb] = countConflicts[0];
    drafts.push({
      kind: "people_count",
      detectedBy: "rule",
      reportIds: pair,
      claimIds: countConflicts.flat().map((c) => c.id),
      description: `Both reports count people ${ca.people!.kind}, but as ${ca.people!.count} and ${cb.people!.count}.`,
    });
  }

  return drafts;
}

// ---------------------------------------------------------------- from Gemini

/** Maps a model-reported conflict kind onto our taxonomy. */
export function aiConflictKind(kind: string): ContradictionKind {
  const map: Record<string, ContradictionKind> = {
    location: "location",
    time: "time",
    hazard: "hazard",
    road_status: "road_status",
    people_count: "people_count",
    description: "semantic",
    other: "semantic",
  };
  return map[kind] ?? "semantic";
}

/** Turns one conflict from a comparison into a reviewable flag. Both sides must be cited. */
export function aiContradiction(
  conflict: { text: string; claimIds: string[]; kind?: string },
  reportIds: string[],
  model: string,
): ContradictionDraft {
  return {
    kind: aiConflictKind(conflict.kind ?? "semantic"),
    detectedBy: "ai",
    description: conflict.text,
    reportIds,
    claimIds: conflict.claimIds,
    model,
  };
}

/** De-duplicates drafts that describe the same conflict, keeping the first. */
export function dedupeDrafts(drafts: ContradictionDraft[]): ContradictionDraft[] {
  const seen = new Map<string, ContradictionDraft>();
  for (const draft of drafts) {
    const key = contradictionFingerprint(draft);
    if (!seen.has(key)) seen.set(key, draft);
  }
  return [...seen.values()];
}
