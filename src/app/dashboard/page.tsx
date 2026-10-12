import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { MapPanel } from "@/components/dashboard/map-panel";
import { getRegion, hazardLabel } from "@/config/regions";
import { requireReviewer } from "@/lib/auth";
import { dashboardData } from "@/lib/dashboard/service";
import type { IncidentStatus } from "@/lib/domain/schemas";
import { getEnv } from "@/lib/env";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

// The responder dashboard (features M10/S3).
//
// Laid out to be scanned rather than read: four numbers across the top for the state of things, the
// map and the incident list side by side because they answer the same question two ways, and what
// has just arrived along the bottom. Nothing here needs a decision to be understood.

export const metadata: Metadata = { title: "Overview" };

const STATUS_TONE: Record<IncidentStatus, { label: string; className: string; dot: string }> = {
  candidate: { label: "Candidate", className: "bg-amber-tint text-amber-strong", dot: "bg-amber" },
  under_review: { label: "Under review", className: "bg-violet-tint text-violet-strong", dot: "bg-violet" },
  verified: { label: "Verified", className: "bg-leaf-tint text-leaf-strong", dot: "bg-leaf" },
  dismissed: { label: "Dismissed", className: "bg-stone-tint text-stone-strong", dot: "bg-stone" },
};

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse bg-sand" aria-hidden />}>
      <Screen searchParams={searchParams} />
    </Suspense>
  );
}

async function Screen({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const reviewer = await requireReviewer("/dashboard");
  const params = await searchParams;

  const asArray = (value: string | string[] | undefined): string[] =>
    value === undefined ? [] : Array.isArray(value) ? value : [value];

  const data = await dashboardData({
    hazard: typeof params.hazard === "string" ? params.hazard : undefined,
    statuses: asArray(params.status) as IncidentStatus[],
    windowHours: typeof params.window === "string" ? Number(params.window) || undefined : undefined,
  });

  const env = getEnv();
  const region = getRegion(env.defaultRegionId);
  const { stats } = data;

  return (
    <AppShell current="/dashboard" reviewer={reviewer}>
      <PageHeader title="Overview" description="What communities have reported, and what is waiting for a person to check.">
        <DashboardFilters hazards={data.hazardsInUse} regionId={region.id} />
      </PageHeader>

      <div className="flex flex-col gap-7 px-6 pb-10 sm:px-10">
        <section aria-label="Counts" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile tone="bg-amber-tint text-amber-strong" value={stats.awaitingReview} label="Awaiting review" hint="Read, not yet checked" />
          <Tile tone="bg-violet-tint text-violet-strong" value={stats.candidateIncidents} label="Candidate incidents" hint="Grouped by the system" />
          <Tile tone="bg-flame-tint text-flame-strong" value={stats.openContradictions} label="Contradictions" hint="Reports that disagree" />
          <Tile tone="bg-leaf-tint text-leaf-strong" value={stats.verifiedIncidents} label="Verified incidents" hint="Confirmed by a reviewer" />
        </section>

        {stats.aiUnavailable > 0 ? (
          <p className="rounded-2xl bg-amber-tint px-5 py-3.5 text-sm text-amber-strong">
            <strong className="font-semibold">{stats.aiUnavailable}</strong> report
            {stats.aiUnavailable === 1 ? " has" : "s have"} not been read automatically. On this deployment that means
            Gemini is not configured, so a reviewer reads them directly — nothing is lost, it is simply slower.
          </p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
          <section aria-labelledby="map-heading" className="flex flex-col gap-3">
            <h2 id="map-heading" className="text-lg font-bold tracking-tight">
              Where things are
            </h2>
            <MapPanel
              points={data.points}
              center={region.map.center}
              zoom={region.map.zoom}
              tileUrl={env.map.tileUrl}
              attribution={env.map.attribution}
            />
            <p className="text-xs text-muted-foreground">
              {data.points.length} point{data.points.length === 1 ? "" : "s"} shown. Places outside the analysis area
              are not necessarily safe — they have not been checked.
            </p>
          </section>

          <section aria-labelledby="incidents-heading" className="flex flex-col gap-3">
            <h2 id="incidents-heading" className="flex items-baseline justify-between text-lg font-bold tracking-tight">
              Incidents
              <span className="text-xs font-normal text-muted-foreground">{data.incidents.length} shown</span>
            </h2>

            {data.incidents.length === 0 ? (
              <Empty>No incidents match these filters.</Empty>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {data.incidents.slice(0, 7).map((incident) => {
                  const tone = STATUS_TONE[incident.status];
                  return (
                    <li key={incident.id}>
                      <Link
                        href={`/incidents/${incident.id}`}
                        className="flex flex-col gap-2 rounded-2xl bg-card p-4 transition-shadow hover:shadow-[0_4px_20px_rgba(28,31,24,0.08)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-sm font-semibold leading-snug">{incident.title}</span>
                          <span
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                              tone.className,
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
                            {tone.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{hazardLabel(region, incident.hazard.category)}</span>
                          <span aria-hidden>·</span>
                          <span>
                            {incident.independentSources} independent
                          </span>
                          {incident.openContradictions > 0 ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="font-medium text-flame-strong">
                                {incident.openContradictions} contradiction
                                {incident.openContradictions === 1 ? "" : "s"}
                              </span>
                            </>
                          ) : null}
                          <span className="ml-auto">{relativeTime(incident.lastReportedAt)}</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section aria-labelledby="incoming-heading" className="flex flex-col gap-3">
          <h2 id="incoming-heading" className="text-lg font-bold tracking-tight">
            Coming in
          </h2>
          {data.activity.length === 0 ? (
            <Empty>Nothing has arrived in this window.</Empty>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-card">
              <div className="hidden grid-cols-[7rem_1fr_1fr_9rem_5rem] gap-4 px-5 py-2.5 text-xs font-medium text-muted-foreground sm:grid">
                <span>Reference</span>
                <span>Hazard</span>
                <span>Place</span>
                <span>Status</span>
                <span className="text-right">When</span>
              </div>
              <ul className="divide-y divide-border/70">
                {data.activity.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={`/reports/${entry.id}`}
                      className="grid grid-cols-2 gap-x-4 gap-y-1 px-5 py-3 text-sm transition-colors hover:bg-sand/60 sm:grid-cols-[7rem_1fr_1fr_9rem_5rem] sm:items-center"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{entry.referenceCode}</span>
                      <span className="text-right font-medium sm:text-left">
                        {entry.hazard ? hazardLabel(region, entry.hazard) : <span className="text-muted-foreground">Not stated</span>}
                      </span>
                      <span className="col-span-2 text-muted-foreground sm:col-span-1">
                        {entry.place ?? "Location not named"}
                      </span>
                      <ReportStatusBadge status={entry.status} />
                      <span className="text-right text-xs text-muted-foreground">{relativeTime(entry.submittedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function ReportStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; dot: string; className: string }> = {
    received: { label: "Not read", dot: "bg-amber", className: "text-amber-strong" },
    extracting: { label: "Reading", dot: "bg-violet", className: "text-violet-strong" },
    extracted: { label: "Read", dot: "bg-violet", className: "text-violet-strong" },
    extraction_failed: { label: "Read failed", dot: "bg-flame", className: "text-flame-strong" },
    ai_unavailable: { label: "Awaiting a person", dot: "bg-amber", className: "text-amber-strong" },
  };
  const tone = map[status] ?? map.received;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", tone.className)}>
      <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
      {tone.label}
    </span>
  );
}

function Tile({
  tone,
  value,
  label,
  hint,
}: {
  tone: string;
  value: number;
  label: string;
  hint: string;
}) {
  // The tile itself carries the colour, as in the reference: a soft wash of the state's own hue,
  // with the number as the loudest thing in it.
  return (
    <div className={cn("flex flex-col gap-4 rounded-2xl p-5", tone)}>
      <div className="flex flex-col">
        <p className="text-[32px] font-bold leading-none tracking-tight tabular-nums">{value}</p>
        <p className="mt-1.5 text-sm font-semibold">{label}</p>
      </div>
      <p className="text-xs opacity-70">{hint}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-center rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
