import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { ReviewBadge } from "@/components/av/trust-labels";
import { ReportWorkspace, type ClaimView, type ExtractionView, type ReportView } from "@/components/review/report-workspace";
import { aiStatus } from "@/lib/ai/gemini";
import { getRegion, hazardLabel } from "@/config/regions";
import { requireReviewer } from "@/lib/auth";
import { getDb } from "@/lib/db";

// The report workspace (feature M4). Everything the reviewer needs to judge one report sits on one
// screen: the reporter's own words, and each claim drawn from them with its source.

export const metadata: Metadata = { title: "Report" };

export default function ReportPage({ params }: PageProps<"/reports/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse bg-sand" aria-hidden />}>
      <Screen params={params} />
    </Suspense>
  );
}

async function Screen({ params }: { params: PageProps<"/reports/[id]">["params"] }) {
  const reviewer = await requireReviewer();
  const { id } = await params;

  const db = getDb();
  const report = await db.reports.get(id);
  if (!report) notFound();

  const region = getRegion(report.regionId);
  const [extraction, claims, incident] = await Promise.all([
    report.latestExtractionId ? db.extractions.get(report.latestExtractionId) : Promise.resolve(null),
    db.claims.list({ where: [{ field: "reportId", op: "==", value: report.id }] }),
    report.incidentId ? db.incidents.get(report.incidentId) : Promise.resolve(null),
  ]);

  const view: ReportView = {
    id: report.id,
    referenceCode: report.referenceCode,
    text: report.text,
    uiLanguage: report.uiLanguage,
    dataLabel: report.dataLabel,
    submittedAt: report.submittedAt,
    status: report.status,
    statusDetail: report.statusDetail,
    reporterHazard: report.reporterHazard,
    location: report.location,
    timeHint: report.timeHint,
    reportedTimeText: report.reportedTimeText,
    media: report.media.map((item) => ({
      id: item.id,
      kind: item.kind,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      storagePath: item.storagePath,
      exif: item.exif,
    })),
  };

  const extractionView: ExtractionView | null = extraction
    ? {
        id: extraction.id,
        model: extraction.model,
        promptVersion: extraction.promptVersion,
        status: extraction.status,
        error: extraction.error,
        detectedLanguage: extraction.detectedLanguage,
        translationEn: extraction.translationEn,
        transcript: extraction.transcript?.text,
        missingInformation: extraction.missingInformation,
        uncertaintyNotes: extraction.uncertaintyNotes,
        validation: extraction.validation,
      }
    : null;

  const claimViews: ClaimView[] = claims
    .map((claim) => ({
      id: claim.id,
      type: claim.type,
      statement: claim.statement,
      statementEn: claim.statementEn,
      origin: claim.origin,
      basis: claim.basis,
      excerpt: claim.excerpt,
      hazardCategory: claim.hazardCategory,
      roadStatus: claim.roadStatus,
      roadName: claim.roadName,
      people: claim.people,
      place: claim.place,
      time: claim.time,
      modelCertainty: claim.modelCertainty,
      review: claim.review,
      editedStatement: claim.editedStatement,
    }))
    // Rejected claims stay visible so a reviewer can change their mind, but at the bottom.
    .sort((a, b) => Number(a.review.status === "rejected") - Number(b.review.status === "rejected"));

  return (
    <AppShell current="/reports" reviewer={reviewer}>
      <PageHeader title={report.referenceCode} description={incident ? `In “${incident.title}”` : "Not yet grouped into an incident"}>
        <ReviewBadge status={claims.some((c) => c.review.status === "unreviewed") ? "unreviewed" : "confirmed"} />
        {incident ? (
          <Link href={`/incidents/${incident.id}`} className="text-sm font-medium text-ink-soft hover:underline">
            Open the incident
          </Link>
        ) : null}
      </PageHeader>

      <div className="px-5 pt-4 sm:px-8">
        <Link href="/reports" className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          All reports
        </Link>
      </div>

      <ReportWorkspace
        report={view}
        extraction={extractionView}
        claims={claimViews}
        hazardLabel={report.reporterHazard ? hazardLabel(region, report.reporterHazard) : undefined}
        incident={incident ? { id: incident.id, title: incident.title, status: incident.status } : null}
        timeZone={region.timezone}
        canRunModel={aiStatus().configured}
      />
    </AppShell>
  );
}
