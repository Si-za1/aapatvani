import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Scale } from "lucide-react";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { DataLabelBadge } from "@/components/av/trust-labels";
import { Badge } from "@/components/ui/badge";
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
  candidate: { label: "Candidate — needs review", className: "bg-amber-tint text-amber-strong" },
  under_review: { label: "Under review", className: "bg-violet-tint text-violet-strong" },
  verified: { label: "Verified by a reviewer", className: "bg-leaf-tint text-leaf-strong" },
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

      <div className="flex flex-col gap-4 px-5 py-6 sm:px-8">
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
              return (
                <li key={incident.id}>
                  <Link
                    href={`/incidents/${incident.id}`}
                    className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-accent"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="text-sm font-semibold">{incident.title}</span>
                      <Badge variant="secondary" className={`shrink-0 rounded-full ${tone.className}`}>
                        {tone.label}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{hazardLabel(region, incident.hazard.category)}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {byIncident.get(incident.id) ?? incident.reportIds.length} report
                        {(byIncident.get(incident.id) ?? incident.reportIds.length) === 1 ? "" : "s"}
                      </span>
                      <span aria-hidden>·</span>
                      <span>
                        {incident.independentSources} independent source
                        {incident.independentSources === 1 ? "" : "s"}
                      </span>
                      {incident.openContradictions > 0 ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="text-flame-strong">
                            {incident.openContradictions} open contradiction
                            {incident.openContradictions === 1 ? "" : "s"}
                          </span>
                        </>
                      ) : null}
                      <span aria-hidden>·</span>
                      <span>last report {relativeTime(incident.lastReportedAt)}</span>
                      <ArrowRight className="ml-auto size-3.5" aria-hidden />
                    </div>
                    {incident.verification ? (
                      <p className="text-xs text-leaf-strong">
                        Verified by {incident.verification.byName} · {relativeTime(incident.verification.at)}
                      </p>
                    ) : null}
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
