import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Sparkles } from "lucide-react";
import { AppShell, ComingSoon, PageHeader } from "@/components/av/app-shell";
import { DataLabelBadge, ReviewBadge } from "@/components/av/trust-labels";
import {
  IncidentWorkspace,
  type ContradictionView,
  type MemberView,
  type SuggestionView,
} from "@/components/review/incident-workspace";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getRegion, hazardLabel } from "@/config/regions";
import { aiStatus } from "@/lib/ai/gemini";
import { requireReviewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { IncidentStatus } from "@/lib/domain/schemas";
import { formatDateTime } from "@/lib/time";

// The incident workspace (feature M4). One screen for settling a grouping: the reports in it, the
// matches the system proposed, and anything the reports disagree about.

export const metadata: Metadata = { title: "Incident" };

const STATUS_TONE: Record<IncidentStatus, { label: string; className: string }> = {
  candidate: { label: "Candidate — needs review", className: "bg-butter-tint text-butter-strong" },
  under_review: { label: "Under review", className: "bg-sky-tint text-sky-strong" },
  verified: { label: "Verified by a reviewer", className: "bg-sage-tint text-sage-strong" },
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
  const [reports, claims, allSuggestions, contradictions] = await Promise.all([
    db.reports.getMany(incident.reportIds),
    db.claims.list({ where: [{ field: "reportId", op: "in", value: incident.reportIds }] }),
    db.suggestions.list({ where: [{ field: "regionId", op: "==", value: incident.regionId }] }),
    db.contradictions.list({ where: [{ field: "incidentId", op: "==", value: incident.id }] }),
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

      <div className="flex flex-col gap-4 px-5 pt-4 sm:px-8">
        <Link href="/incidents" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink-soft hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          All incidents
        </Link>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden />
            {incident.location
              ? `${incident.location.lat.toFixed(5)}, ${incident.location.lng.toFixed(5)} ±${incident.location.uncertaintyM} m (${incident.location.source.replace("_", " ")})`
              : "No location established"}
          </span>
          <span>First reported {formatDateTime(incident.firstReportedAt, region.timezone)}</span>
          <span>
            {incident.independentSources} independent source{incident.independentSources === 1 ? "" : "s"}
          </span>
          <ReviewBadge status={unreviewed > 0 ? "unreviewed" : "confirmed"} />
          {unreviewed > 0 ? <span>{unreviewed} claims still unreviewed</span> : null}
        </div>
      </div>

      <IncidentWorkspace
        incidentId={incident.id}
        members={members}
        suggestions={suggestionViews}
        contradictions={contradictionViews}
        reportLabels={reportLabels}
        canRunModel={aiStatus().configured}
      />

      <div className="flex flex-col gap-3 px-5 pb-8 sm:px-8">
        {incident.status === "verified" ? null : (
          <Card className="gap-2 border-dashed p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-ink-soft" aria-hidden />
              Settling this incident
            </p>
            <p className="text-sm text-muted-foreground">
              Marking an incident verified confirms that these reports describe one event, and confirms every
              membership with it. Route actions that change state live on each card above.
            </p>
          </Card>
        )}
        <ComingSoon what="The Blast Radius panel, per-finding confirm and dismiss, and cited alert drafts" chunk="chunk 7" />
      </div>
    </AppShell>
  );
}
