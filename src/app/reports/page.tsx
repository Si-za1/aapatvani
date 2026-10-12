import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { DataLabelBadge } from "@/components/av/trust-labels";
import { Badge } from "@/components/ui/badge";
import { getRegion, hazardLabel } from "@/config/regions";
import { requireReviewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { Report } from "@/lib/domain/schemas";
import { getEnv } from "@/lib/env";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

// The review queue: everything that has come in, with what still needs a person at the top.

export const metadata: Metadata = { title: "Reports" };

const VIEWS = [
  { key: "awaiting", label: "Awaiting review" },
  { key: "all", label: "All reports" },
  { key: "unread", label: "Not read automatically" },
] as const;

/** Reports a reviewer still has to look at. */
const AWAITING: Report["status"][] = ["extracted", "extraction_failed"];

const STATUS_TONE: Record<Report["status"], { label: string; className: string }> = {
  received: { label: "Not read yet", className: "bg-butter-tint text-butter-strong" },
  extracting: { label: "Reading…", className: "bg-sky-tint text-sky-strong" },
  extracted: { label: "Read, awaiting review", className: "bg-sky-tint text-sky-strong" },
  extraction_failed: { label: "Reading failed", className: "bg-clay-tint text-clay-strong" },
  ai_unavailable: { label: "Awaiting a person", className: "bg-butter-tint text-butter-strong" },
};

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
  const view = (VIEWS.find((v) => v.key === params.view)?.key ?? "awaiting") as (typeof VIEWS)[number]["key"];

  const db = getDb();
  const env = getEnv();
  const region = getRegion(env.defaultRegionId);

  const [all, claims] = await Promise.all([
    db.reports.list({ orderBy: { field: "submittedAt", direction: "desc" } }),
    db.claims.list({}),
  ]);
  const [extractions, incidents] = await Promise.all([db.extractions.list({}), db.incidents.list({})]);

  const claimsByReport = new Map<string, number>();
  for (const claim of claims) claimsByReport.set(claim.reportId, (claimsByReport.get(claim.reportId) ?? 0) + 1);
  const unreadWithClaims = new Map<string, number>();
  for (const extraction of extractions) {
    if (extraction.status === "failed") unreadWithClaims.set(extraction.reportId, extraction.validation.errors.length);
  }
  const incidentTitle = new Map(incidents.map((i) => [i.id, i.title]));

  const reports =
    view === "awaiting"
      ? all.filter((r) => AWAITING.includes(r.status))
      : view === "unread"
        ? all.filter((r) => r.status === "ai_unavailable" || r.status === "received")
        : all;

  return (
    <AppShell current="/reports" reviewer={reviewer}>
      <PageHeader
        title="Reports"
        description="Every report as it arrived. Open one to compare the original against what was read from it."
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {VIEWS.map((option) => {
            const active = option.key === view;
            const count =
              option.key === "awaiting"
                ? all.filter((r) => AWAITING.includes(r.status)).length
                : option.key === "unread"
                  ? all.filter((r) => r.status === "ai_unavailable" || r.status === "received").length
                  : all.length;
            return (
              <Link
                key={option.key}
                href={option.key === "awaiting" ? "/reports" : `/reports?view=${option.key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent",
                )}
              >
                {option.label}
                <span className="tabular-nums opacity-70">{count}</span>
              </Link>
            );
          })}
        </div>
      </PageHeader>

      <div className="flex flex-col gap-4 px-5 py-6 sm:px-8">
        {reports.length === 0 ? (
          <p className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <Inbox className="size-6 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Nothing here</span>
            <span className="text-sm text-muted-foreground">
              {view === "awaiting" ? "Every report has been looked at." : "No reports have arrived yet."}
            </span>
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {reports.map((report) => {
              const tone = STATUS_TONE[report.status];
              const failures = unreadWithClaims.get(report.id);
              return (
                <li key={report.id}>
                  <Link href={`/reports/${report.id}`} className="flex flex-col gap-2 px-4 py-3.5 hover:bg-accent sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{report.referenceCode}</span>
                      <span className="text-sm font-medium">
                        {report.reporterHazard ? hazardLabel(region, report.reporterHazard) : "Hazard not stated"}
                      </span>
                      <Badge variant="secondary" className={`rounded-full text-xs ${tone.className}`}>
                        {tone.label}
                      </Badge>
                      {report.incidentId ? (
                        <Badge variant="secondary" className="rounded-full bg-river-tint text-xs text-river-strong">
                          In an incident
                        </Badge>
                      ) : null}
                      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                        {relativeTime(report.submittedAt)}
                        <ArrowRight className="size-3.5" aria-hidden />
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground" lang={report.uiLanguage}>
                      {report.text || "(no text — see the attachments)"}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{claimsByReport.get(report.id) ?? 0} claims</span>
                      {report.media.length > 0 ? <span>{report.media.length} attachment(s)</span> : null}
                      <span>{report.location.placeText ?? (report.location.source === "none" ? "No location" : `Location by ${report.location.source.replace("_", " ")}`)}</span>
                      {report.incidentId ? <span className="text-river-strong">{incidentTitle.get(report.incidentId)}</span> : null}
                      {failures ? <span className="text-clay-strong">{failures} validation problem(s)</span> : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p className="flex items-center gap-2 pb-4 text-xs text-muted-foreground">
          <DataLabelBadge label={env.defaultDataLabel} />
          Original submissions are never modified, and are never deleted.
        </p>
      </div>
    </AppShell>
  );
}
