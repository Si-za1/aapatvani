import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckCircle2, GitCompareArrows, Inbox, Layers, TriangleAlert } from "lucide-react";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { SectionCard, SeeAll, StatCard } from "@/components/av/cards";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { IncidentList } from "@/components/dashboard/incident-list";
import { LatestReports } from "@/components/dashboard/latest-reports";
import { MapPanel } from "@/components/dashboard/map-panel";
import { getRegion } from "@/config/regions";
import { requireReviewer } from "@/lib/auth";
import { dashboardData } from "@/lib/dashboard/service";
import type { IncidentStatus } from "@/lib/domain/schemas";
import { getEnv } from "@/lib/env";
import { getReviewerPrefs } from "@/lib/prefs";
import { greeting } from "@/lib/time";

// The responder overview (features M10/S3).
//
// Four blocks, in the order a shift actually goes: what the numbers are, where it is happening, what
// has been grouped, and what has just come in. The old page carried five and read as a wall; the
// ordering is the design, and nothing here needs a decision to be understood.
//
// Everything that is not a destination moved into the chrome: the region and the data label sit in
// the top bar, what happened lately is behind the bell, and the filters are three controls rather
// than four standing buttons. What is left is the picture itself.

export const metadata: Metadata = { title: "Overview" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<div className="h-[36rem] animate-pulse rounded-3xl bg-sand/60" aria-hidden />}>
      <Screen searchParams={searchParams} />
    </Suspense>
  );
}

async function Screen({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const reviewer = await requireReviewer("/dashboard");
  const params = await searchParams;
  const prefs = await getReviewerPrefs();

  const asArray = (value: string | string[] | undefined): string[] =>
    value === undefined ? [] : Array.isArray(value) ? value : [value];

  // No window in the URL means "whatever this reviewer set as their default", which is why the
  // absence of the parameter and the word "all" are different things.
  const requestedWindow = typeof params.window === "string" ? params.window : undefined;
  const windowHours = requestedWindow
    ? Number(requestedWindow) || undefined
    : prefs.windowHours || undefined;

  const data = await dashboardData({
    hazard: typeof params.hazard === "string" ? params.hazard : undefined,
    statuses: asArray(params.status) as IncidentStatus[],
    windowHours,
  });

  const env = getEnv();
  const region = getRegion(env.defaultRegionId);
  const { stats } = data;

  const arrived = [`${stats.reports} report${stats.reports === 1 ? "" : "s"} so far`];
  if (stats.last24h > 0) arrived.push(`${stats.last24h} in the last day`);
  const waiting =
    stats.awaitingReview > 0
      ? `${stats.awaitingReview} still ${stats.awaitingReview === 1 ? "needs" : "need"} a person to check.`
      : "Nothing is waiting on a person.";

  return (
    <AppShell current="/dashboard" reviewer={reviewer}>
      <PageHeader title={`${greeting(data.generatedAt)}, ${reviewer.name}`} description={`${arrived.join(", ")}. ${waiting}`}>
        <DashboardFilters hazards={data.hazardsInUse} regionId={region.id} windowHours={prefs.windowHours} />
      </PageHeader>

      <div className="flex flex-col gap-5">
        {/* Two up even on the narrowest phone: four numbers a responder can see at once are worth
            more than four numbers they have to scroll past. */}
        <section aria-label="Counts" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            href="/reports"
            icon={Inbox}
            value={stats.awaitingReview}
            label="Awaiting review"
            hint="Read, and not yet checked by a person."
            tone="bg-amber-tint text-amber-strong"
          />
          <StatCard
            href="/incidents"
            icon={Layers}
            value={stats.candidateIncidents}
            label="Candidate incidents"
            hint="Grouped by the system. Only a reviewer settles a grouping."
            tone="bg-violet-tint text-violet-strong"
          />
          <StatCard
            href="/incidents"
            icon={GitCompareArrows}
            value={stats.openContradictions}
            label="Contradictions"
            hint="Reports that disagree with each other, still open."
            tone="bg-flame-tint text-flame-strong"
          />
          <StatCard
            href="/incidents"
            icon={CheckCircle2}
            value={stats.verifiedIncidents}
            label="Verified incidents"
            hint="Confirmed by a named reviewer."
            tone="bg-leaf-tint text-leaf-strong"
          />
        </section>

        {stats.aiUnavailable > 0 ? (
          <p className="flex items-start gap-3 rounded-3xl bg-amber-tint px-5 py-4 text-sm text-amber-strong">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong className="font-semibold">
                {stats.aiUnavailable} report{stats.aiUnavailable === 1 ? " has" : "s have"}
              </strong>{" "}
              not been read automatically, so a reviewer reads them directly. Nothing is lost, it is simply slower.
            </span>
          </p>
        ) : null}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <SectionCard
            title="Where things are"
            note={`${data.points.length} point${data.points.length === 1 ? "" : "s"} on the map`}
          >
            <MapPanel
              points={data.points}
              center={region.map.center}
              zoom={region.map.zoom}
              tileUrl={env.map.tileUrl}
              attribution={env.map.attribution}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Places outside the analysis area are not necessarily safe. They have not been checked.
            </p>
          </SectionCard>

          <SectionCard
            title="Incidents"
            note={`${data.incidents.length} shown`}
            action={<SeeAll href="/incidents">See all</SeeAll>}
          >
            {data.incidents.length === 0 ? (
              <Empty>No incidents match these filters.</Empty>
            ) : (
              <IncidentList incidents={data.incidents.slice(0, 6)} regionId={region.id} />
            )}
          </SectionCard>
        </div>

        <SectionCard
          title="Latest reports"
          note="Newest first"
          action={<SeeAll href="/reports">See all reports</SeeAll>}
        >
          {data.activity.length === 0 ? (
            <Empty>Nothing has arrived in this window.</Empty>
          ) : (
            <LatestReports reports={data.activity.slice(0, 4)} regionId={region.id} />
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-center rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
