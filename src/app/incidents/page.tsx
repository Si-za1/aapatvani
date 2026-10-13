import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { DataLabelBadge } from "@/components/av/trust-labels";
import { getRegion, hazardLabel } from "@/config/regions";
import { requireReviewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { IncidentStatus } from "@/lib/domain/schemas";
import { getEnv } from "@/lib/env";
import { relativeTime } from "@/lib/time";

// The incident list. Grouping is proposed by the system and settled by a reviewer, so the status is
// the most prominent thing on each row.

export const metadata: Metadata = { title: "Incidents" };

const TONE: Record<IncidentStatus, { label: string; className: string }> = {
  candidate: { label: "Needs review", className: "bg-amber-tint text-amber-strong" },
  under_review: { label: "Under review", className: "bg-violet-tint text-violet-strong" },
  verified: { label: "Verified", className: "bg-leaf-tint text-leaf-strong" },
  dismissed: { label: "Dismissed", className: "bg-stone-tint text-stone-strong" },
};

export default function IncidentsPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse bg-sand" aria-hidden />}>
      <Screen />
    </Suspense>
  );
}

async function Screen() {
  const reviewer = await requireReviewer("/incidents");
  const db = getDb();
  const env = getEnv();
  const region = getRegion(env.defaultRegionId);

  const incidents = await db.incidents.list({ orderBy: { field: "lastReportedAt", direction: "desc" } });
  const reports = await db.reports.list({});
  const byIncident = new Map<string, number>();
  for (const report of reports) {
    if (report.incidentId) byIncident.set(report.incidentId, (byIncident.get(report.incidentId) ?? 0) + 1);
  }

  return (
    <AppShell current="/incidents" reviewer={reviewer}>
      <PageHeader
        title="Incidents"
        description="Reports the system believes describe the same event. Only a reviewer settles a grouping."
      />

      <div className="flex flex-col gap-4">
        {incidents.length === 0 ? (
          <p className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <Scale className="size-6 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">No incidents yet</span>
            <span className="text-sm text-muted-foreground">
              An incident is opened automatically when a report arrives, then grouped as more come in.
            </span>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {incidents.map((incident) => {
              const tone = TONE[incident.status];
              const count = byIncident.get(incident.id) ?? incident.reportIds.length;
              return (
                <li key={incident.id}>
                  <Link
                    href={`/incidents/${incident.id}`}
                    className="grid gap-x-6 gap-y-2 rounded-2xl bg-card px-5 py-4 transition-shadow hover:shadow-[0_4px_20px_rgba(28,31,24,0.08)] lg:grid-cols-[1fr_11rem_10rem_5rem] lg:items-center"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-semibold leading-snug">{incident.title}</span>
                      {incident.verification ? (
                        <span className="text-xs text-leaf-strong">
                          Verified by {incident.verification.byName} · {relativeTime(incident.verification.at)}
                        </span>
                      ) : null}
                    </div>

                    {/* Aligned columns rather than a flowing line, so rows can be scanned down. */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground lg:flex-col lg:items-start lg:gap-0.5">
                      <span className="font-medium text-foreground">{hazardLabel(region, incident.hazard.category)}</span>
                      <span>
                        {count} report{count === 1 ? "" : "s"} · {incident.independentSources} independent
                      </span>
                      {incident.openContradictions > 0 ? (
                        <span className="font-medium text-flame-strong">
                          {incident.openContradictions} contradiction
                          {incident.openContradictions === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>

                    <span
                      className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ${tone.className}`}
                    >
                      {tone.label}
                    </span>

                    <span className="text-xs text-muted-foreground lg:text-right">
                      {relativeTime(incident.lastReportedAt)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p className="flex items-center gap-2 pb-4 text-xs text-muted-foreground">
          <DataLabelBadge label={env.defaultDataLabel} />
          A copy of a report is linked to the report it copies, and never counted as a second witness.
        </p>
      </div>
    </AppShell>
  );
}
