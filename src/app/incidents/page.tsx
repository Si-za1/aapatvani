import { Suspense } from "react";
import type { Metadata } from "next";
import { Scale } from "lucide-react";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { DataLabelBadge } from "@/components/av/trust-labels";
import { IncidentBoard, IncidentRows, type BoardGroup } from "@/components/incidents/incident-board";
import { IncidentFilters } from "@/components/incidents/incident-filters";
import { getRegion } from "@/config/regions";
import { requireReviewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { Incident, IncidentStatus } from "@/lib/domain/schemas";
import { getEnv } from "@/lib/env";
import { isWithinHours } from "@/lib/time";

// The incident board.
//
// One panel per hazard, because "what landslides do we have?" is the question a shift actually asks,
// and a flat list makes you answer it by reading every row. The panel is tinted by the most
// attention-needing incident inside it, so the loudest thing on the page is the thing that most needs
// a person, and the header says which in words rather than leaving the colour to speak for itself.

export const metadata: Metadata = { title: "Incidents" };

/** Unresolved work first, settled work last: the order the panels and the rows are both built in. */
const STATUS_ORDER: Record<IncidentStatus, number> = {
  candidate: 0,
  under_review: 1,
  verified: 2,
  dismissed: 3,
};

export default function IncidentsPage({ searchParams }: PageProps<"/incidents">) {
  return (
    <Suspense fallback={<div className="h-[36rem] animate-pulse rounded-3xl bg-sand/60" aria-hidden />}>
      <Screen searchParams={searchParams} />
    </Suspense>
  );
}

async function Screen({ searchParams }: { searchParams: PageProps<"/incidents">["searchParams"] }) {
  const reviewer = await requireReviewer("/incidents");
  const params = await searchParams;
  const db = getDb();
  const env = getEnv();
  const region = getRegion(env.defaultRegionId);

  const [all, reports] = await Promise.all([db.incidents.list({}), db.reports.list({})]);
  const reportCounts = new Map<string, number>();
  for (const report of reports) {
    if (report.incidentId) reportCounts.set(report.incidentId, (reportCounts.get(report.incidentId) ?? 0) + 1);
  }

  const statuses = (Array.isArray(params.status) ? params.status : params.status ? [params.status] : []).filter(
    (value): value is IncidentStatus => value in STATUS_ORDER,
  );
  const windowHours = typeof params.window === "string" ? Number(params.window) || undefined : undefined;
  const view = params.view === "list" ? "list" : "board";

  const incidents = all
    .filter((incident) => (statuses.length ? statuses.includes(incident.status) : true))
    .filter((incident) => (windowHours ? isWithinHours(incident.lastReportedAt, windowHours) : true));

  const ordered = [...incidents].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.lastReportedAt.localeCompare(a.lastReportedAt),
  );

  return (
    <AppShell current="/incidents" reviewer={reviewer}>
      <PageHeader
        title="Incidents"
        description="Reports the system believes describe the same event, grouped by hazard. Only a reviewer settles a grouping."
      >
        <IncidentFilters total={all.length} shown={incidents.length} />
      </PageHeader>

      {all.length === 0 ? (
        <p className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <Scale className="size-6 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">No incidents yet</span>
          <span className="text-sm text-muted-foreground">
            An incident is opened automatically when a report arrives, then grouped as more come in.
          </span>
        </p>
      ) : incidents.length === 0 ? (
        <p className="flex items-center justify-center rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
          No incidents match these filters.
        </p>
      ) : view === "board" ? (
        <IncidentBoard groups={byHazard(ordered)} reportCounts={reportCounts} regionId={region.id} />
      ) : (
        <IncidentRows incidents={ordered} reportCounts={reportCounts} regionId={region.id} />
      )}

      <p className="flex flex-wrap items-center gap-2 pt-6 text-xs text-muted-foreground">
        <DataLabelBadge label={env.defaultDataLabel} />
        A copy of a report is linked to the report it copies, and never counted as a second witness.
      </p>
    </AppShell>
  );
}

/** One group per hazard, the group with the most unsettled work first. */
function byHazard(incidents: Incident[]): BoardGroup[] {
  const groups = new Map<string, Incident[]>();
  for (const incident of incidents) {
    const key = incident.hazard.category;
    groups.set(key, [...(groups.get(key) ?? []), incident]);
  }

  const urgency = (group: BoardGroup) => Math.min(...group.incidents.map((incident) => STATUS_ORDER[incident.status]));
  const weight = (group: BoardGroup) =>
    group.incidents.reduce((sum, incident) => sum + incident.independentSources, 0);

  // Unresolved first, then the groups resting on the most evidence, which is where a reviewer's
  // attention is best spent next.
  return [...groups.entries()]
    .map(([hazard, list]) => ({ hazard, incidents: list }))
    .sort((a, b) => urgency(a) - urgency(b) || weight(b) - weight(a) || a.hazard.localeCompare(b.hazard));
}
