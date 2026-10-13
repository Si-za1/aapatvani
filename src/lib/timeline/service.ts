import "server-only";

// The evidence chain, as a sequence in time.
//
// Everything this app knows is already in the store, and every record already carries the moment it
// happened and the kind of actor that produced it. The timeline adds no facts: it reads the same
// reports, claims, incidents, impact assessments and alert drafts the other pages read and puts them
// in order, so the answer to "how do we know this?" is a thing you can look at rather than a thing
// you have to reconstruct from five screens.
//
// One honesty rule shapes all of it: the axis is **when a piece of evidence entered the record**, not
// when the event happened. The reporter's own words about when it happened are shown beside it,
// attributed, because that is the only thing we actually have, and inventing a happened-at time
// would be exactly the kind of guess this product exists to avoid.

import { getDb } from "@/lib/db";
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

const QUOTE_LIMIT = 160;

function shorten(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > QUOTE_LIMIT ? `${clean.slice(0, QUOTE_LIMIT).trimEnd()}…` : clean;
}

const TIME_HINT: Record<string, string> = {
  now: "the reporter says it is happening now",
  earlier_today: "the reporter says it happened earlier today",
  yesterday: "the reporter says it happened yesterday",
  unsure: "the reporter is not sure when it happened",
};

const REVIEW_VERB: Record<string, string> = {
  confirmed: "confirmed",
  edited: "corrected",
  rejected: "rejected",
  needs_info: "sent back for more information",
};

export async function timelineData(category?: string): Promise<TimelineData> {
  const now = Date.now();
  const db = getDb();

  const [reports, claims, extractions, incidents, impacts, alerts] = await Promise.all([
    db.reports.list({ orderBy: { field: "submittedAt", direction: "desc" } }),
    db.claims.list({}),
    db.extractions.list({}),
    db.incidents.list({}),
    db.impacts.list({}),
    db.alerts.list({}),
  ]);

  const reportById = new Map(reports.map((r) => [r.id, r]));
  const incidentById = new Map(incidents.map((i) => [i.id, i]));
  const claimsByReport = new Map<string, typeof claims>();
  for (const claim of claims) claimsByReport.set(claim.reportId, [...(claimsByReport.get(claim.reportId) ?? []), claim]);

  /** The category an entry belongs to: what the report said, else what its incident settled on. */
  const categoryOfReport = (reportId: string): string | undefined => {
    const report = reportById.get(reportId);
    if (!report) return undefined;
    if (report.reporterHazard) return report.reporterHazard;
    return report.incidentId ? incidentById.get(report.incidentId)?.hazard.category : undefined;
  };

  const entries: TimelineEntry[] = [];
  const add = (entry: Omit<TimelineEntry, "id"> & { id: string }) => entries.push(entry);

  // 1. A report arriving. The first link in the chain, and the only one a member of the public made.
  for (const report of reports) {
    const hint = report.timeHint ? TIME_HINT[report.timeHint] : undefined;
    const placed = report.location.placeText
      ? `from ${report.location.placeText}`
      : report.location.source === "gps"
        ? "with a GPS pin"
        : report.location.source === "pin"
          ? "with a pin dropped on the map"
          : "with no location";
    add({
      id: `report:${report.id}`,
      at: report.submittedAt,
      kind: "report",
      actor: "public",
      title: `Report received ${placed}`,
      detail: hint,
      quote: shorten(report.text),
      about: report.referenceCode,
      href: `/reports/${report.id}`,
      hazard: categoryOfReport(report.id),
    });
  }

  // 2. The model reading it. `ai_unavailable` deployments have no extraction, and the timeline says
  //    nothing rather than implying one happened.
  for (const extraction of extractions) {
    const report = reportById.get(extraction.reportId);
    if (!report) continue;
    const read = claimsByReport.get(extraction.reportId) ?? [];
    if (extraction.status !== "ok" || read.length === 0) continue;
    const quoted = read.filter((claim) => claim.origin === "reporter").length;
    add({
      id: `read:${extraction.id}`,
      at: extraction.createdAt,
      kind: "read",
      actor: "ai",
      title: `Read ${read.length} claim${read.length === 1 ? "" : "s"} from it`,
      detail:
        quoted > 0
          ? `${quoted} of them quoting the reporter's own words, the rest labelled as interpretation`
          : "All of them labelled as the model's interpretation, none quoting the reporter",
      about: report.referenceCode,
      href: `/reports/${report.id}`,
      hazard: categoryOfReport(report.id),
    });
  }

  // 3. A person deciding about a claim. Only the decisions: an unreviewed claim is not an event.
  for (const claim of claims) {
    const decision = claim.review;
    if (decision.status === "unreviewed" || !decision.at) continue;
    const report = reportById.get(claim.reportId);
    add({
      id: `review:${claim.id}`,
      at: decision.at,
      kind: "review",
      actor: "human",
      title: `Claim ${REVIEW_VERB[decision.status] ?? decision.status} by ${decision.by?.name ?? "a reviewer"}`,
      detail: shorten(claim.statementEn),
      about: report ? `${report.referenceCode} · ${claim.type.replace(/_/g, " ")}` : claim.type.replace(/_/g, " "),
      href: `/reports/${claim.reportId}`,
      hazard: categoryOfReport(claim.reportId),
    });
  }

  // 4. Incidents opening, and being settled.
  for (const incident of incidents) {
    const first = incident.members[0]?.reportId;
    const firstReport = first ? reportById.get(first) : undefined;
    add({
      id: `incident:${incident.id}`,
      at: incident.createdAt,
      kind: "incident",
      actor: "system",
      title: `Incident opened: ${incident.title}`,
      detail: firstReport
        ? `Candidate grouping opened from ${firstReport.referenceCode}, for a reviewer to settle`
        : "Candidate grouping opened for a reviewer to settle",
      href: `/incidents/${incident.id}`,
      hazard: incident.hazard.category,
    });

    if (incident.verification) {
      add({
        id: `verified:${incident.id}`,
        at: incident.verification.at,
        kind: "incident",
        actor: "human",
        title: `Incident verified by ${incident.verification.byName}`,
        detail: `${incident.independentSources} independent source${incident.independentSources === 1 ? "" : "s"}; copies not counted`,
        href: `/incidents/${incident.id}`,
        hazard: incident.hazard.category,
      });
    }
  }

  // 5. The road analysis, which is the computed link in the chain.
  for (const impact of impacts) {
    const support = impact.stats.lostAccessAny ?? 0;
    const longer = impact.stats.longerRouteAny ?? 0;
    add({
      id: `impact:${impact.id}`,
      at: impact.createdAt,
      kind: "impact",
      actor: "human",
      title: `Blast radius run by ${impact.createdBy.name}`,
      detail:
        impact.candidates.length === 0
          ? impact.statusMessage
          : `${impact.candidates.length} finding${impact.candidates.length === 1 ? "" : "s"} · ${support} settlement${support === 1 ? "" : "s"} lose a mapped route to care, ${longer} take a longer one`,
      href: `/incidents/${impact.incidentId}`,
      hazard: incidentById.get(impact.incidentId)?.hazard.category,
    });
  }

  // 6. Alert drafts, and the approval that is the last thing that ever happens to one.
  for (const alert of alerts) {
    add({
      id: `alert:${alert.id}`,
      at: alert.createdAt,
      kind: "alert",
      actor: "ai",
      title: "Alert draft written from confirmed facts",
      detail:
        alert.validation.removedSentences > 0
          ? `${alert.validation.removedSentences} sentence${alert.validation.removedSentences === 1 ? "" : "s"} removed for resting on nothing cited`
          : "Every sentence cited, every number checked against its source",
      href: `/incidents/${alert.incidentId}`,
      hazard: incidentById.get(alert.incidentId)?.hazard.category,
    });

    if (alert.decision) {
      add({
        id: `alert-decision:${alert.id}`,
        at: alert.decision.at,
        kind: "alert",
        actor: "human",
        title:
          alert.status === "approved"
            ? `Alert approved by ${alert.decision.byName}`
            : `Alert ${alert.status} by ${alert.decision.byName}`,
        detail: "Nothing is ever sent by this app",
        href: `/incidents/${alert.incidentId}`,
        hazard: incidentById.get(alert.incidentId)?.hazard.category,
      });
    }
  }

  const categories = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.hazard) continue;
    categories.set(entry.hazard, (categories.get(entry.hazard) ?? 0) + 1);
  }

  const scoped = category ? entries.filter((entry) => entry.hazard === category) : entries;
  // Newest first. When two entries share a moment, the order is the order of the chain itself: a
  // report, then the model reading it, then a person deciding. Left to the sort alone that would be
  // whatever order the loop above happened to use, which is a detail of this function rather than a
  // property of the evidence.
  const rank: Record<TimelineKind, number> = { report: 0, read: 1, review: 2, incident: 3, impact: 4, alert: 5 };
  scoped.sort((a, b) => b.at.localeCompare(a.at) || rank[a.kind] - rank[b.kind]);

  return {
    entries: scoped,
    categories: [...categories.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
    generatedAt: new Date(now).toISOString(),
  };
}
