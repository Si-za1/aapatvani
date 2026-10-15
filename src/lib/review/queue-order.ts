// What a reviewer should look at first.
//
// The queue was ordered by arrival, newest first — a reasonable default, and the wrong one during an
// event. A reviewer's attention is the scarce resource, and where it changes an outcome most is not
// where the clock is newest. Three witnesses to a blocked road with four villages cut off from care
// is not the same work as one uncorroborated report of flooding, and arrival order treats them
// identically.
//
// The order is TIERED rather than scored, deliberately. A weighted total would order the list
// correctly and explain nothing, and this application already refuses to put a number in front of a
// person without saying what it is made of — that is the whole trust model. Every tier carries the
// reason it is in that tier, the queue shows it, and a reviewer can disagree with the ordering
// instead of merely receiving it.

import type { Claim, Incident, Report } from "@/lib/domain/schemas";

export interface QueueItem {
  report: Report;
  /** 1 is the most urgent. */
  tier: number;
  /** Why it sits where it does, shown on the row. Empty when nothing distinguishes it. */
  reason: string;
}

export interface QueueContext {
  claimsByReport: Map<string, Claim[]>;
  incidentsById: Map<string, Incident>;
  /** Incident ids whose road-access analysis produced findings. */
  impactedIncidentIds: Set<string>;
}

/**
 * The tiers, in the order a reviewer should work them.
 *
 * Consequence first, then disagreement, then corroboration, then sheer volume of unread work. The
 * last tier is not a judgement that a report is unimportant — it is the absence of anything that
 * distinguishes it, which is why it carries no reason.
 */
export const QUEUE_TIER = {
  /** A computable consequence: a road that may be cut, and settlements that lose their route to care. */
  impact: 1,
  /** Two reports disagree about the same place and the same road. Nothing is settled while it is open. */
  disputed: 2,
  /** More than one independent account, so it is more likely to be real. */
  corroborated: 3,
  /** Nothing distinctive, but claims nobody has read. */
  unread: 4,
  /** Read, or nothing to read. */
  rest: 5,
} as const;

export function rankForReview(reports: Report[], ctx: QueueContext): QueueItem[] {
  const ranked: QueueItem[] = reports.map((report) => {
    const incident = report.incidentId ? ctx.incidentsById.get(report.incidentId) : undefined;
    const unreviewed = (ctx.claimsByReport.get(report.id) ?? []).filter((c) => c.review.status === "unreviewed").length;

    if (incident && ctx.impactedIncidentIds.has(incident.id)) {
      return { report, tier: QUEUE_TIER.impact, reason: "Road-access analysis has findings" };
    }
    if (incident && incident.openContradictions > 0) {
      const n = incident.openContradictions;
      return { report, tier: QUEUE_TIER.disputed, reason: `${n} open contradiction${n === 1 ? "" : "s"}` };
    }
    if (incident && incident.independentSources >= 2) {
      return { report, tier: QUEUE_TIER.corroborated, reason: `${incident.independentSources} independent sources` };
    }
    if (unreviewed > 0) {
      return { report, tier: QUEUE_TIER.unread, reason: `${unreviewed} claim${unreviewed === 1 ? "" : "s"} unread` };
    }
    return { report, tier: QUEUE_TIER.rest, reason: "" };
  });

  // Within a tier, whoever has waited longest. An unreviewed report is a person still waiting, and
  // nothing about being new makes that more urgent than being old.
  return ranked.sort((a, b) =>
    a.tier !== b.tier ? a.tier - b.tier : a.report.submittedAt.localeCompare(b.report.submittedAt),
  );
}
