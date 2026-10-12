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
import type { Report } from "@/lib/domain/schemas";
import { getEnv } from "@/lib/env";
import { isWithinHours, relativeTime } from "@/lib/time";

// The review queue, as cards grouped by what kind of incident they describe.
//
// Cards rather than rows: a report is a piece of writing with a place attached, and a table row
// reduces all of that to a line of metadata. Grouping by hazard is how a reviewer actually thinks
// about a shift, because what needs checking depends on the kind of event.

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
  const [all, claims] = await Promise.all([db.reports.list({}), db.claims.list({})]);

  const claimsByReport = new Map<string, number>();
  for (const claim of claims) claimsByReport.set(claim.reportId, (claimsByReport.get(claim.reportId) ?? 0) + 1);

  const statusFilter = typeof params.status === "string" ? params.status : "awaiting";
  const hazardFilter = typeof params.hazard === "string" ? params.hazard : undefined;
  const windowHours = typeof params.window === "string" ? Number(params.window) || undefined : undefined;

  let reports = all;
  if (statusFilter === "awaiting") reports = reports.filter((r) => AWAITING.includes(r.status));
  else if (statusFilter === "unread") reports = reports.filter((r) => r.status === "ai_unavailable" || r.status === "received");
  if (hazardFilter) reports = reports.filter((r) => r.reporterHazard === hazardFilter);
  if (windowHours) reports = reports.filter((r) => isWithinHours(r.submittedAt, windowHours));
  reports = [...reports].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  // Grouped by the kind of incident. Reports that stated no hazard get their own group last, since
  // "we do not know what this is" is itself a reason to look at something.
  const groups = new Map<string, Report[]>();
  for (const report of reports) {
    const key = report.reporterHazard ?? "__unstated";
    groups.set(key, [...(groups.get(key) ?? []), report]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === "__unstated" ? 1 : b === "__unstated" ? -1 : 0));

  const hazardsInUse = [...new Set(all.map((r) => r.reporterHazard).filter((h): h is string => Boolean(h)))].sort();

  return (
    <AppShell current="/reports" reviewer={reviewer}>
      <PageHeader
        title="Reports"
        description="Every report as it arrived, grouped by the kind of incident it describes. Open one to compare the original against what was read from it."
      >
        <ReportFilters hazards={hazardsInUse} regionId={region.id} total={reports.length} />
      </PageHeader>

      <div className="flex flex-col gap-9 px-6 pb-10 sm:px-10">
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
                  {group.map((report) => {
                    const tone = STATUS_TONE[report.status];
                    const claimCount = claimsByReport.get(report.id) ?? 0;
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
