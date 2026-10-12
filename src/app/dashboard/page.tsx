import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleCheck, Clock, MapPin, Scale, TriangleAlert } from "lucide-react";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { DataLabelBadge } from "@/components/av/trust-labels";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { MapPanel } from "@/components/dashboard/map-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getRegion, hazardLabel } from "@/config/regions";
import { requireReviewer } from "@/lib/auth";
import { dashboardData } from "@/lib/dashboard/service";
import type { IncidentStatus } from "@/lib/domain/schemas";
import { getEnv } from "@/lib/env";
import { relativeTime } from "@/lib/time";

// The responder dashboard (features M10/S3): counts, a map, the incident list and what has come in.

export const metadata: Metadata = { title: "Dashboard" };

const STATUS_TONE: Record<IncidentStatus, { label: string; className: string }> = {
  candidate: { label: "Candidate", className: "bg-butter-tint text-butter-strong" },
  under_review: { label: "Under review", className: "bg-sky-tint text-sky-strong" },
  verified: { label: "Verified", className: "bg-sage-tint text-sage-strong" },
  dismissed: { label: "Dismissed", className: "bg-stone-tint text-stone-strong" },
};

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<Shell title="Dashboard" />}>
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
      <PageHeader title="Dashboard" description="What communities have reported, and what is waiting for a person to check.">
        <DashboardFilters hazards={data.hazardsInUse} regionId={region.id} />
      </PageHeader>

      <div className="flex flex-col gap-6 px-5 py-6 sm:px-8">
        <section aria-label="Counts" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Tile
            icon={<Clock className="size-4" />}
            tone="bg-butter-tint text-butter-strong"
            value={stats.awaitingReview}
            label="Awaiting review"
            hint="Extracted, not yet checked"
          />
          <Tile
            icon={<Scale className="size-4" />}
            tone="bg-sky-tint text-sky-strong"
            value={stats.candidateIncidents}
            label="Candidate incidents"
            hint="Grouped by the system"
          />
          <Tile
            icon={<TriangleAlert className="size-4" />}
            tone="bg-clay-tint text-clay-strong"
            value={stats.openContradictions}
            label="Open contradictions"
            hint="Reports that disagree"
          />
          <Tile
            icon={<CircleCheck className="size-4" />}
            tone="bg-sage-tint text-sage-strong"
            value={stats.verifiedIncidents}
            label="Verified incidents"
            hint="Confirmed by a reviewer"
          />
          <Tile
            icon={<MapPin className="size-4" />}
            tone="bg-rose-tint text-rose-strong"
            value={stats.last24h}
            label="Reports in 24 h"
            hint={`${stats.reports} in total`}
          />
        </section>

        {stats.aiUnavailable > 0 ? (
          <p className="rounded-2xl bg-butter-tint px-4 py-3 text-sm text-butter-strong">
            <strong className="font-semibold">{stats.aiUnavailable}</strong> report
            {stats.aiUnavailable === 1 ? " has" : "s have"} not been read automatically. On this deployment that means
            Gemini is not configured, so a reviewer reads them directly — nothing is lost, it is simply slower.
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section aria-labelledby="map-heading" className="flex flex-col gap-3">
            <h2 id="map-heading" className="text-sm font-semibold">
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
            <h2 id="incidents-heading" className="flex items-center justify-between text-sm font-semibold">
              Incidents
              <span className="font-normal text-muted-foreground">{data.incidents.length} shown</span>
            </h2>
            {data.incidents.length === 0 ? (
              <Empty>No incidents match these filters.</Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.incidents.slice(0, 8).map((incident) => {
                  const tone = STATUS_TONE[incident.status];
                  return (
                    <li key={incident.id}>
                      <Link
                        href={`/incidents/${incident.id}`}
                        className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3.5 transition-colors hover:bg-accent"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium">{incident.title}</span>
                          <Badge variant="secondary" className={`shrink-0 rounded-full ${tone.className}`}>
                            {tone.label}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{hazardLabel(region, incident.hazard.category)}</span>
                          <span aria-hidden>·</span>
                          <span>
                            {incident.independentSources} independent source
                            {incident.independentSources === 1 ? "" : "s"}
                          </span>
                          {incident.openContradictions > 0 ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="text-clay-strong">
                                {incident.openContradictions} contradiction
                                {incident.openContradictions === 1 ? "" : "s"}
                              </span>
                            </>
                          ) : null}
                          <span aria-hidden>·</span>
                          <span>{relativeTime(incident.lastReportedAt)}</span>
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
          <h2 id="incoming-heading" className="text-sm font-semibold">
            Coming in
          </h2>
          {data.activity.length === 0 ? (
            <Empty>Nothing has arrived in this window.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {data.activity.map((entry) => (
                <li key={entry.id}>
                  <Link href={`/reports/${entry.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-accent">
                    <span className="font-mono text-xs text-muted-foreground">{entry.referenceCode}</span>
                    <span className="text-sm font-medium">{entry.hazard ? hazardLabel(region, entry.hazard) : "Hazard not stated"}</span>
                    <span className="text-sm text-muted-foreground">{entry.place ?? "Location not named"}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <ReportStatusBadge status={entry.status} />
                      <span className="text-xs text-muted-foreground">{relativeTime(entry.submittedAt)}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="flex items-center gap-2 pb-4 text-xs text-muted-foreground">
          <DataLabelBadge label={env.defaultDataLabel} />
          The demo runs on synthetic reports over a real OpenStreetMap road network.
        </p>
      </div>
    </AppShell>
  );
}

function ReportStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    received: { label: "Not read yet", className: "bg-butter-tint text-butter-strong" },
    extracting: { label: "Reading", className: "bg-sky-tint text-sky-strong" },
    extracted: { label: "Read", className: "bg-sky-tint text-sky-strong" },
    extraction_failed: { label: "Read failed", className: "bg-clay-tint text-clay-strong" },
    ai_unavailable: { label: "Awaiting a person", className: "bg-butter-tint text-butter-strong" },
  };
  const tone = map[status] ?? map.received;
  return <Badge variant="secondary" className={`rounded-full text-xs ${tone.className}`}>{tone.label}</Badge>;
}

function Tile({
  icon,
  tone,
  value,
  label,
  hint,
}: {
  icon: React.ReactNode;
  tone: string;
  value: number;
  label: string;
  hint: string;
}) {
  return (
    <Card className="gap-2 p-4">
      <span className={`inline-flex size-8 items-center justify-center rounded-full ${tone}`} aria-hidden>
        {icon}
      </span>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <div className="flex flex-col">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function Shell({ title }: { title: string }) {
  return (
    <div className="flex min-h-screen flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="h-64 animate-pulse rounded-2xl bg-sand" aria-hidden />
    </div>
  );
}
