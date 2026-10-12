// Candidate generation: which pairs of reports are worth asking Gemini about.
//
// Cheap deterministic filters run first (region, time, distance, hazard), because a model call per
// pair is expensive and most pairs in a busy region are obviously unrelated. Coordinates come only
// from GPS, a map pin or a gazetteer match, never from the model (see project.md §3).

import { hazardRelation, type RegionConfig } from "@/config/regions";
import type { Claim, Report } from "@/lib/domain/schemas";
import { haversineM } from "@/lib/geo/math";
import { hoursBetween } from "@/lib/time";

/** Reports further apart in time than this are never compared. */
export const CANDIDATE_WINDOW_HOURS = 24;
/** Straight-line base radius, added to both reports' location uncertainty. */
export const CANDIDATE_RADIUS_M = 5_000;
/** Used when a report was placed by a pin or by GPS but the browser did not report an accuracy. */
const DEFAULT_UNCERTAINTY_M = { report_gps: 50, report_pin: 150 } as const;

export interface ReportPoint {
  lat: number;
  lng: number;
  uncertaintyM: number;
  source: "report_gps" | "report_pin" | "gazetteer";
  /** The claim whose gazetteer match placed this report, when that is how it was placed. */
  basisClaimId?: string;
}

/**
 * Where a report is, as far as our data goes. Returns null when nothing places it, a report with
 * no GPS, no pin and no recognisable place name. Such a report is deliberately not compared:
 * guessing a location is exactly what the trust model forbids, so the pair is left for a reviewer.
 */
export function reportPoint(report: Report, claims: Claim[]): ReportPoint | null {
  const { location } = report;
  if ((location.source === "gps" || location.source === "pin") && location.lat !== undefined && location.lng !== undefined) {
    const source = location.source === "gps" ? ("report_gps" as const) : ("report_pin" as const);
    return { lat: location.lat, lng: location.lng, uncertaintyM: location.accuracyM ?? DEFAULT_UNCERTAINTY_M[source], source };
  }
  // A place name the gazetteer recognised is a real location, but a less certain one.
  for (const claim of claims) {
    const resolved = claim.place?.resolved;
    if (resolved && !claim.place?.ambiguous) {
      return {
        lat: resolved.lat,
        lng: resolved.lng,
        uncertaintyM: resolved.uncertaintyM,
        source: "gazetteer",
        basisClaimId: claim.id,
      };
    }
  }
  return null;
}

/**
 * The hazard a report describes: the reporter's own pick when they made one, otherwise the AI's
 * hazard claim. Returns undefined when neither exists.
 */
export function reportHazard(report: Report, claims: Claim[]): string | undefined {
  if (report.reporterHazard) return report.reporterHazard;
  return claims.find((c) => c.type === "hazard" && c.hazardCategory)?.hazardCategory;
}

export interface PairFeatures {
  /** Straight-line distance between the two reported locations, in km. */
  distanceKm: number | null;
  /** Distance minus both uncertainty radii, floored at zero. What the radius test uses. */
  effectiveDistanceKm: number | null;
  hoursApart: number | null;
  hazardMatch: "same" | "compatible" | "different" | "unknown";
  /** Cosine similarity of the two report embeddings. Filled in by the caller, which loads them. */
  semanticSimilarity: number | null;
  sharedMedia: boolean;
  sameReporter: boolean;
}

export interface PairContext {
  report: Report;
  claims: Claim[];
  point: ReportPoint | null;
  hazard: string | undefined;
}

export function pairContext(report: Report, claims: Claim[]): PairContext {
  return { report, claims, point: reportPoint(report, claims), hazard: reportHazard(report, claims) };
}

function sharedMedia(a: Report, b: Report): boolean {
  const hashes = new Set(a.media.map((m) => m.sha256));
  return b.media.some((m) => hashes.has(m.sha256));
}

export function pairFeatures(a: PairContext, b: PairContext, region: RegionConfig): PairFeatures {
  let distanceKm: number | null = null;
  let effectiveDistanceKm: number | null = null;
  if (a.point && b.point) {
    const metres = haversineM(a.point.lat, a.point.lng, b.point.lat, b.point.lng);
    distanceKm = metres / 1000;
    const slack = a.point.uncertaintyM + b.point.uncertaintyM;
    effectiveDistanceKm = Math.max(0, metres - slack) / 1000;
  }
  return {
    distanceKm,
    effectiveDistanceKm,
    hoursApart: hoursBetween(a.report.submittedAt, b.report.submittedAt),
    hazardMatch: hazardRelation(region, a.hazard, b.hazard),
    semanticSimilarity: null,
    sharedMedia: sharedMedia(a.report, b.report),
    sameReporter: Boolean(a.report.reporterToken) && a.report.reporterToken === b.report.reporterToken,
  };
}

export type CandidateVerdict = { candidate: true } | { candidate: false; reason: string };

/**
 * The candidate rule (project.md §8.2): same region, at most 24 h apart, at most 5 km apart plus
 * both uncertainty radii, and hazards that are not known to be different.
 * Copies are excluded here, they are found separately and linked, not compared as independent
 * evidence.
 */
export function candidateVerdict(a: PairContext, b: PairContext, region: RegionConfig, features: PairFeatures): CandidateVerdict {
  if (a.report.regionId !== b.report.regionId) return { candidate: false, reason: "different region" };
  if (!a.point || !b.point) {
    return { candidate: false, reason: `no location for ${!a.point ? "the first" : "the second"} report` };
  }
  if (features.hoursApart !== null && features.hoursApart > CANDIDATE_WINDOW_HOURS) {
    return { candidate: false, reason: `more than ${CANDIDATE_WINDOW_HOURS} h apart` };
  }
  if (features.effectiveDistanceKm !== null && features.effectiveDistanceKm * 1000 > CANDIDATE_RADIUS_M) {
    return { candidate: false, reason: `more than ${CANDIDATE_RADIUS_M / 1000} km apart` };
  }
  if (features.hazardMatch === "different") return { candidate: false, reason: "hazards are not compatible" };
  return { candidate: true };
}

/** Stable ordering for a pair of ids, so a pair always produces the same suggestion id. */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
