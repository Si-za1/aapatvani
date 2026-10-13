import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { IncidentTabs } from "@/components/review/incident-tabs";
import { AlertPanel } from "@/components/alerts/alert-panel";
import { DataLabelBadge, ReviewBadge } from "@/components/av/trust-labels";
import { ImpactMapPanel } from "@/components/impact/impact-map-panel";
import { ImpactPanel } from "@/components/impact/impact-panel";
import {
  IncidentWorkspace,
  type ContradictionView,
  type MemberView,
  type SuggestionView,
} from "@/components/review/incident-workspace";
import { Badge } from "@/components/ui/badge";
import { getRegion, hazardLabel } from "@/config/regions";
import { aiStatus } from "@/lib/ai/gemini";
import { alertReadiness } from "@/lib/ai/alerts";
import { latestAlert } from "@/lib/alerts/service";
import { requireReviewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { IncidentStatus } from "@/lib/domain/schemas";
import { getEnv } from "@/lib/env";
import { confirmedCandidates, latestAssessment } from "@/lib/impact/service";
import { formatDateTime } from "@/lib/time";

// The incident workspace (features M4/M9/M11). One screen for settling a grouping, analysing what a
// blocked road would mean, and drafting a cited alert for a person to approve.

export const metadata: Metadata = { title: "Incident" };

const STATUS_TONE: Record<IncidentStatus, { label: string; className: string }> = {
  candidate: { label: "Candidate, needs review", className: "bg-amber-tint text-amber-strong" },
  under_review: { label: "Under review", className: "bg-violet-tint text-violet-strong" },
  verified: { label: "Verified by a reviewer", className: "bg-leaf-tint text-leaf-strong" },
  dismissed: { label: "Dismissed", className: "bg-stone-tint text-stone-strong" },
};

export default function IncidentPage({ params }: PageProps<"/incidents/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse bg-sand" aria-hidden />}>
      <Screen params={params} />
    </Suspense>
  );
}

async function Screen({ params }: { params: PageProps<"/incidents/[id]">["params"] }) {
  const reviewer = await requireReviewer();
  const { id } = await params;

  const db = getDb();
  const incident = await db.incidents.get(id);
  if (!incident) notFound();

  const region = getRegion(incident.regionId);
  const env = getEnv();
  const [reports, claims, allSuggestions, contradictions, assessment, alert, assessments] = await Promise.all([
    db.reports.getMany(incident.reportIds),
    db.claims.list({ where: [{ field: "reportId", op: "in", value: incident.reportIds }] }),
    db.suggestions.list({ where: [{ field: "regionId", op: "==", value: incident.regionId }] }),
    db.contradictions.list({ where: [{ field: "incidentId", op: "==", value: incident.id }] }),
    latestAssessment(incident.id),
    latestAlert(incident.id),
    db.impacts.list({ where: [{ field: "incidentId", op: "==", value: incident.id }] }),
  ]);

  const reportIds = new Set(incident.reportIds);
  const suggestions = allSuggestions.filter((s) => s.reportIds.some((rid) => reportIds.has(rid)));
  const claimsByReport = new Map<string, typeof claims>();
  for (const claim of claims) {
    claimsByReport.set(claim.reportId, [...(claimsByReport.get(claim.reportId) ?? []), claim]);
  }

  const members: MemberView[] = incident.members.flatMap((member) => {
    const report = reports.find((r) => r.id === member.reportId);
    if (!report) return [];
    const own = claimsByReport.get(report.id) ?? [];
    return [
      {
        reportId: report.id,
        referenceCode: report.referenceCode,
        membership: member.membership,
        copyOf: member.copyOf,
        copyReasons: member.copyReasons,
        text: report.text,
        uiLanguage: report.uiLanguage,
        submittedAt: report.submittedAt,
        hazards: report.reporterHazard ? [report.reporterHazard] : [],
        claimCount: own.length,
        unreviewedClaims: own.filter((c) => c.review.status === "unreviewed").length,
      },
    ];
  });

  const memberReportIds = incident.reportIds;
  const suggestionViews: SuggestionView[] = suggestions
    .filter((s) => s.reportIds.every((rid) => memberReportIds.includes(rid)) || s.status === "pending")
    .map((s) => ({
      id: s.id,
      reportIds: s.reportIds,
      score: s.score,
      status: s.status,
      copySuspected: s.copySuspected,
      copyReasons: s.copyReasons,
      features: s.features,
      ai: s.ai
        ? {
            verdict: s.ai.verdict,
            rationale: s.ai.rationale,
            agreements: s.ai.agreements.map((a) => ({ text: a.text })),
            conflicts: s.ai.conflicts.map((c) => ({ text: c.text })),
            model: s.ai.model,
            citationsRejected: s.ai.citationsRejected,
          }
        : undefined,
    }));

  const contradictionViews: ContradictionView[] = contradictions.map((c) => ({
    id: c.id,
    kind: c.kind,
    detectedBy: c.detectedBy,
    description: c.description,
    status: c.status,
    claimIds: c.claimIds,
    model: c.model,
    resolution: c.resolution ? { byName: c.resolution.byName, note: c.resolution.note } : undefined,
  }));

  // Read once, here, and handed to the client components that need it, so that what the server
  // renders and what the browser hydrates agree about what time it is.
  const now = new Date().toISOString();

  const status = STATUS_TONE[incident.status];
  const unreviewed = claims.filter((c) => c.review.status === "unreviewed").length;
  const reportLabels = Object.fromEntries(reports.map((r) => [r.id, r.referenceCode]));

  return (
    <AppShell current="/incidents" reviewer={reviewer}>
      <PageHeader title={incident.title} description={`${hazardLabel(region, incident.hazard.category)} · hazard suggested by ${incident.hazard.source}`}>
        <Badge variant="secondary" className={`rounded-full ${status.className}`}>
          {status.label}
        </Badge>
        <DataLabelBadge label={incident.dataLabel} />
      </PageHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/incidents" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink-soft hover:underline">
            <ArrowLeft className="size-4" aria-hidden />
            All incidents
          </Link>
        </div>

        {/* What this is, in one strip. The responder's first three questions are what happened, why we
            think so, and where, and they are answered here before anything else on the page. */}
        <dl className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          <Fact label="Where">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              {incident.location
                ? `${incident.location.lat.toFixed(4)}, ${incident.location.lng.toFixed(4)} ±${incident.location.uncertaintyM} m`
                : "No location established"}
            </span>
          </Fact>
          <Fact label="Why we think so">
            {members.length} report{members.length === 1 ? "" : "s"} · {incident.independentSources} independent
            {unreviewed > 0 ? ` · ${unreviewed} claim${unreviewed === 1 ? "" : "s"} unchecked` : ""}
          </Fact>
          <Fact label="Road analysis">
            {assessment ? `Run, version ${assessment.version} · ${assessment.candidates.length} findings` : "Not run yet"}
          </Fact>
          <Fact label="Alert">
            {alert ? `${alert.status[0].toUpperCase()}${alert.status.slice(1)} · nothing is ever sent` : "Not drafted"}
          </Fact>
        </dl>

        <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>First reported {formatDateTime(incident.firstReportedAt, region.timezone)}</span>
          <ReviewBadge status={unreviewed > 0 ? "unreviewed" : "confirmed"} />
        </p>
      </div>

      {/* Four parts, one at a time. The heaviest thing here was never any single section; it was all
          of them at once, one under the other, with the road analysis two thousand pixels down. */}
      <div className="pt-6">
        <IncidentTabs
          fallback="evidence"
          tabs={[
            {
              key: "evidence",
              label: "Evidence",
              badge: String(members.length),
              content: (
                <IncidentWorkspace
                  incidentId={incident.id}
                  members={members}
                  suggestions={[]}
                  contradictions={[]}
                  reportLabels={reportLabels}
                  canRunModel={aiStatus().configured}
                  section="evidence"
                />
              ),
            },
            {
              key: "grouping",
              label: "Grouping",
              badge: String(suggestions.filter((s) => s.status === "pending").length + contradictions.filter((c) => c.status === "open").length),
              attention: contradictions.some((c) => c.status === "open"),
              content: (
                <IncidentWorkspace
                  incidentId={incident.id}
                  members={[]}
                  suggestions={suggestionViews}
                  contradictions={contradictionViews}
                  reportLabels={reportLabels}
                  canRunModel={aiStatus().configured}
                  section="grouping"
                />
              ),
            },
            {
              key: "impact",
              label: "Impact",
              badge: assessment ? `v${assessment.version}` : "not run",
              attention: !assessment,
              content: (
                <ImpactPanel
                  incidentId={incident.id}
                  assessment={assessment}
                  history={assessments
                    .slice()
                    .sort((a, b) => b.version - a.version)
                    .map((entry) => ({
                      id: entry.id,
                      version: entry.version,
                      createdAt: entry.createdAt,
                      createdBy: entry.createdBy.name,
                      status: entry.status,
                      candidates: entry.candidates.length,
                    }))}
                  timeZone={region.timezone}
                  now={now}
                  canRunModel={aiStatus().configured}
                  map={
                    assessment && incident.location ? (
                      <ImpactMapPanel
                        assessment={assessment}
                        incident={{ lat: incident.location.lat, lng: incident.location.lng, label: incident.title }}
                        center={[incident.location.lat, incident.location.lng]}
                        zoom={13}
                        tileUrl={env.map.tileUrl}
                        attribution={env.map.attribution}
                      />
                    ) : null
                  }
                />
              ),
            },
            {
              key: "alert",
              label: "Alert draft",
              badge: alert ? alert.status : "none",
              content: (
                <AlertPanel
                  incidentId={incident.id}
                  draft={alert}
                  readiness={alertReadiness({ claims })}
                  confirmedClaims={claims.filter((c) => c.review.status === "confirmed" || c.review.status === "edited").length}
                  confirmedImpacts={confirmedCandidates(assessment).length}
                  openContradictions={contradictions.filter((c) => c.status === "open").length}
                  citationLabels={Object.fromEntries([
                    ...claims.map((claim) => [claim.id, (claim.editedStatement ?? claim.statementEn).slice(0, 60)]),
                    ...(assessment?.candidates ?? []).map((candidate) => [candidate.id, candidate.name.slice(0, 60)]),
                    ...contradictions.map((contradiction) => [contradiction.id, contradiction.kind.replace("_", " ")]),
                  ])}
                  timeZone={region.timezone}
                  canRunModel={aiStatus().configured}
                />
              ),
            },
          ]}
        />
      </div>
    </AppShell>
  );
}

/** One fact in the strip at the top: a small label, and the answer. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-card px-4 py-3">
      <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
