import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { HazardGlyph } from "@/components/av/hazard-icon";
import { ReportFilters } from "@/components/reports/report-filters";
import { getRegion, hazardLabel } from "@/config/regions";
import type { HazardIcon } from "@/config/regions/types";
import { requireReviewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { Claim, Report } from "@/lib/domain/schemas";
import { getEnv } from "@/lib/env";
import { getReviewerPrefs } from "@/lib/prefs";
import { rankForReview, type QueueItem } from "@/lib/review/queue-order";
import { isWithinHours, relativeTime } from "@/lib/time";

// The review queue, as cards grouped by what kind of incident they describe.
//
// Cards rather than rows: a report is a piece of writing with a place attached, and a table row
// reduces all of that to a line of metadata. Grouping by hazard is how a reviewer actually thinks
// about a shift, because what needs checking depends on the kind of event.
//
// Within a group the order is by consequence rather than arrival — see lib/review/queue-order.ts.
// Each card says why it sits where it does, so the ordering is something a reviewer can disagree
// with rather than something that simply happens to them.

export const metadata: Metadata = { title: "Reports" };

const STATUS_TONE: Record<Report["status"], { label: string; className: string }> = {
  received: { label: "Not read", className: "bg-amber-tint text-amber-strong" },
  extracting: { label: "Reading", className: "bg-violet-tint text-violet-strong" },
  extracted: { label: "Awaiting review", className: "bg-violet-tint text-violet-strong" },
  extraction_failed: { label: "Reading failed", className: "bg-flame-tint text-flame-strong" },
  ai_unavailable: { label: "Awaiting a person", className: "bg-amber-tint text-amber-strong" },
};

/** Reports a reviewer still has to look at. */
const AWAITING: Report["status"][] = ["extracted", "extraction_failed"];

export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse bg-sand" aria-hidden />}>
      <Screen searchParams={searchParams} />
    </Suspense>
  );
}

async function Screen({ searchParams }: { searchParams: PageProps<"/reports">["searchParams"] }) {
  const reviewer = await requireReviewer("/reports");
  const params = await searchParams;
  const env = getEnv();
  const region = getRegion(env.defaultRegionId);

  const db = getDb();
  const [all, claims, incidents, impacts] = await Promise.all([
    db.reports.list({}),
    db.claims.list({}),
    db.incidents.list({}),
    db.impacts.list({}),
  ]);

  const claimsByReport = new Map<string, Claim[]>();
  for (const claim of claims) claimsByReport.set(claim.reportId, [...(claimsByReport.get(claim.reportId) ?? []), claim]);

  // What the queue is ordered by: consequence, then disagreement, then corroboration.
  const queueContext = {
    claimsByReport,
    incidentsById: new Map(incidents.map((incident) => [incident.id, incident])),
    impactedIncidentIds: new Set(impacts.filter((a) => a.candidates.length > 0).map((a) => a.incidentId)),
  };

  // No status in the URL means "whatever this reviewer set as their default", which is why the
  // absence of the parameter and the word "all" are different things.
  const prefs = await getReviewerPrefs();
  const statusFilter = typeof params.status === "string" ? params.status : prefs.queue;
  const hazardFilter = typeof params.hazard === "string" ? params.hazard : undefined;
  const windowHours = typeof params.window === "string" ? Number(params.window) || undefined : undefined;

  let reports = all;
  if (statusFilter === "awaiting") reports = reports.filter((r) => AWAITING.includes(r.status));
  else if (statusFilter === "unread") reports = reports.filter((r) => r.status === "ai_unavailable" || r.status === "received");
  if (hazardFilter) reports = reports.filter((r) => r.reporterHazard === hazardFilter);
  if (windowHours) reports = reports.filter((r) => isWithinHours(r.submittedAt, windowHours));
  // Ordered by consequence, then grouped. The grouping is unchanged; the ranking decides the order
  // inside each group.
  const queue = rankForReview(reports, queueContext);

  // Grouped by the kind of incident. Reports that stated no hazard get their own group last, since
  // "we do not know what this is" is itself a reason to look at something.
  const groups = new Map<string, QueueItem[]>();
  for (const item of queue) {
    const key = item.report.reporterHazard ?? "__unstated";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === "__unstated" ? 1 : b === "__unstated" ? -1 : 0));

  const hazardsInUse = [...new Set(all.map((r) => r.reporterHazard).filter((h): h is string => Boolean(h)))].sort();

  return (
    <AppShell current="/reports" reviewer={reviewer}>
      <PageHeader
        title="Reports"
        description="Every report as it arrived, grouped by the kind of incident it describes. Open one to compare the original against what was read from it."
      >
        <ReportFilters
          hazards={hazardsInUse}
          regionId={region.id}
          total={reports.length}
          defaultStatus={prefs.queue}
        />
      </PageHeader>

      <div className="flex flex-col gap-9">
        {reports.length === 0 ? (
          <p className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border px-6 py-16 text-center">
            <Inbox className="size-6 text-muted-foreground" aria-hidden />
            <span className="text-sm font-semibold">Nothing here</span>
            <span className="text-sm text-muted-foreground">
              {statusFilter === "awaiting" ? "Every report has been looked at." : "No reports match these filters."}
            </span>
          </p>
        ) : (
          ordered.map(([key, group]) => {
            const hazard = key === "__unstated" ? undefined : region.hazards.find((h) => h.id === key);
            return (
              <section key={key} aria-labelledby={`group-${key}`} className="flex flex-col gap-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-sand">
                    <HazardGlyph icon={(hazard?.icon ?? "unclear") as HazardIcon} className="size-4 text-ink-soft" />
                  </span>
                  <h2 id={`group-${key}`} className="text-lg font-bold tracking-tight">
                    {hazard ? hazardLabel(region, key) : "Hazard not stated"}
                  </h2>
                  <span className="rounded-full bg-sand px-2.5 py-0.5 text-xs font-medium tabular-nums">{group.length}</span>
                </div>

                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {group.map(({ report, reason }) => {
                    const tone = STATUS_TONE[report.status];
                    const claimCount = claimsByReport.get(report.id)?.length ?? 0;
                    return (
                      <li key={report.id}>
                        <Link
                          href={`/reports/${report.id}`}
                          className="group flex h-full flex-col gap-3 rounded-3xl bg-card p-5 transition-shadow hover:shadow-[0_6px_28px_rgba(28,31,24,0.10)]"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground">{report.referenceCode}</span>
                            <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tone.className}`}>
                              {tone.label}
                            </span>
                          </div>

                          {/* Why this card sits where it does. A queue that reorders silently is a
                              queue a reviewer learns to distrust; the reason is the ordering's
                              provenance, so it is shown on the card rather than in a tooltip. */}
                          {reason ? (
                            <span className="w-fit rounded-full bg-sand px-2 py-0.5 text-[10px] font-semibold tracking-wide text-ink-soft uppercase">
                              {reason}
                            </span>
                          ) : null}

                          <p className="line-clamp-3 text-sm leading-relaxed" lang={report.uiLanguage}>
                            {report.text || "(no text: the report is the attachment)"}
                          </p>

                          <div className="mt-auto flex items-end justify-between gap-3 pt-1">
                            <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                              <span>
                                {report.location.placeText ??
                                  (report.location.source === "none"
                                    ? "No location given"
                                    : `Location by ${report.location.source.replace("_", " ")}`)}
                              </span>
                              <span>
                                {claimCount} claim{claimCount === 1 ? "" : "s"} · {relativeTime(report.submittedAt)}
                              </span>
                            </div>
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sand transition-transform group-hover:translate-x-0.5">
                              <ArrowRight className="size-4" aria-hidden />
                            </span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}

        <p className="text-xs text-muted-foreground">
          Original submissions are never modified, and are never deleted. A copy of a report is linked to the report it
          copies, and never counted as a second witness.
        </p>
      </div>
    </AppShell>
  );
}
