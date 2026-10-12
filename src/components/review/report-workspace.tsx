"use client";

// The report workspace (feature M4): the original on the left, what was read from it on the right.
//
// Hovering or focusing a claim highlights the words in the original it was drawn from, which is the
// whole point of the screen — a reviewer should be able to check a claim against the reporter's own
// words without hunting for them.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileAudio, FileImage, LoaderCircle, MapPin, Route, Sparkles } from "lucide-react";
import { DataLabelBadge, OriginBadge, ReviewBadge } from "@/components/av/trust-labels";
import { Button } from "@/components/ui/button";
import { segmentText } from "@/lib/evidence/excerpt";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ClaimCard, type ClaimView } from "./claim-card";

// The page builds these views, so the types are part of this module's surface.
export type { ClaimView };

export interface ReportView {
  id: string;
  referenceCode: string;
  text: string;
  uiLanguage: "en" | "ne";
  dataLabel: "synthetic" | "historical" | "operational";
  submittedAt: string;
  status: string;
  statusDetail?: string;
  reporterHazard?: string;
  location: { source: string; lat?: number; lng?: number; accuracyM?: number; placeText?: string };
  timeHint?: string;
  reportedTimeText?: string;
  media: Array<{ id: string; kind: "photo" | "audio"; mimeType: string; sizeBytes: number; storagePath: string; exif?: { takenAt?: string } }>;
}

export interface ExtractionView {
  id: string;
  model: string;
  promptVersion: string;
  status: string;
  error?: string;
  detectedLanguage?: string;
  translationEn?: string;
  transcript?: string;
  missingInformation: string[];
  uncertaintyNotes: string[];
  validation: { warnings: string[]; errors: string[]; droppedClaims: number; unverifiedExcerpts: number; citationsChecked: number; citationsRejected: number };
}

export function ReportWorkspace({
  report,
  extraction,
  claims,
  hazardLabel,
  incident,
  timeZone,
  canRunModel,
}: {
  report: ReportView;
  extraction: ExtractionView | null;
  claims: ClaimView[];
  hazardLabel?: string;
  incident: { id: string; title: string; status: string } | null;
  timeZone: string;
  canRunModel: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState<"extract" | "match" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Highlight ranges come from the verified excerpt offsets, which point into the original text.
  const segments = useMemo(() => {
    const ranges = claims
      .filter((claim) => claim.excerpt?.verified && claim.excerpt.start !== undefined && claim.excerpt.end !== undefined)
      .map((claim) => ({ start: claim.excerpt!.start!, end: claim.excerpt!.end!, id: claim.id }));
    return segmentText(report.text, ranges);
  }, [claims, report.text]);

  const activeClaim = claims.find((claim) => claim.id === active);

  async function run(kind: "extract" | "match") {
    setBusy(kind);
    setNote(null);
    try {
      const path = kind === "extract" ? `/api/reports/${report.id}/extract` : `/api/reports/${report.id}/match`;
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kind === "match" ? { rulesOnly: false } : { match: true }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; aiAvailable?: boolean; message?: string };
      if (!response.ok) setNote(body.error ?? "That did not run.");
      else setNote(body.message ?? (kind === "match" ? "Matching re-run." : "Done."));
      router.refresh();
    } catch {
      setNote("That did not run. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_1.05fr]">
      <section aria-labelledby="original-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="original-heading" className="text-sm font-semibold">
            The original report
          </h2>
          <DataLabelBadge label={report.dataLabel} />
          <span className="text-xs text-muted-foreground">
            {formatDateTime(report.submittedAt, timeZone)} · {report.uiLanguage === "ne" ? "written in Nepali" : "written in English"}
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="whitespace-pre-wrap text-sm" lang={report.uiLanguage}>
            {segments.map((segment, index) =>
              segment.ids.length ? (
                <mark
                  key={index}
                  className="excerpt-mark"
                  data-active={segment.ids.includes(active ?? "")}
                  onMouseEnter={() => setActive(segment.ids[0])}
                  onMouseLeave={() => setActive(null)}
                >
                  {segment.text}
                </mark>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </p>
          {report.text.trim() === "" ? (
            <p className="text-sm text-muted-foreground">No text was sent. The report is the attachment below.</p>
          ) : null}
        </div>

        {report.media.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {report.media.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {item.kind === "photo" ? <FileImage className="size-3.5" aria-hidden /> : <FileAudio className="size-3.5" aria-hidden />}
                  {item.kind === "photo" ? "Photo" : "Voice note"} · {(item.sizeBytes / 1024 / 1024).toFixed(1)} MB
                  {item.exif?.takenAt ? ` · taken ${formatDateTime(item.exif.takenAt, timeZone)}` : ""}
                </span>
                {item.kind === "photo" ? (
                  // Served through the session-checked media route; never a public URL.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/media/${report.id}/${item.id}`}
                    alt="Attachment sent with the report"
                    className="max-h-96 w-fit rounded-xl border border-border object-contain"
                  />
                ) : (
                  <audio src={`/api/media/${report.id}/${item.id}`} controls className="w-full" />
                )}
              </li>
            ))}
          </ul>
        ) : null}

        <dl className="flex flex-col gap-2 rounded-2xl bg-sand p-4 text-sm">
          <Row term="Hazard the reporter picked">{hazardLabel ?? "not stated"}</Row>
          <Row term="Where">
            {report.location.source === "none"
              ? "not given"
              : `${report.location.placeText ?? `${report.location.lat?.toFixed(5)}, ${report.location.lng?.toFixed(5)}`} (${report.location.source.replace("_", " ")}${
                  report.location.accuracyM ? `, ±${report.location.accuracyM} m` : ""
                })`}
          </Row>
          <Row term="When">{report.reportedTimeText ?? report.timeHint?.replace("_", " ") ?? "not stated"}</Row>
          <Row term="Incident">
            {incident ? `${incident.title} (${incident.status.replace("_", " ")})` : "not yet grouped"}
          </Row>
        </dl>

        {report.statusDetail ? <p className="rounded-2xl bg-amber-tint px-4 py-3 text-sm text-amber-strong">{report.statusDetail}</p> : null}
      </section>

      <section aria-labelledby="claims-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="claims-heading" className="text-sm font-semibold">
            What was read from it
            <span className="ml-2 font-normal text-muted-foreground">
              {claims.length} claim{claims.length === 1 ? "" : "s"}
            </span>
          </h2>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run("extract")} className="rounded-full">
              {busy === "extract" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
              Read again
            </Button>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run("match")} className="rounded-full">
              {busy === "match" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Route className="size-3.5" aria-hidden />}
              Match again
            </Button>
          </div>
        </div>

        {!canRunModel ? (
          <p className="rounded-2xl bg-amber-tint px-4 py-3 text-sm text-amber-strong">
            Gemini is not configured on this deployment, so these buttons will not read anything new. Everything else on
            this page works.
          </p>
        ) : null}

        {note ? <p className="rounded-2xl bg-moss-tint px-4 py-3 text-sm text-moss-strong">{note}</p> : null}

        {extraction ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
            <p className="flex flex-wrap items-center gap-2">
              <OriginBadge origin="ai" />
              <span>
                {extraction.model} · {extraction.promptVersion}
              </span>
              {extraction.detectedLanguage ? <span>· detected {extraction.detectedLanguage}</span> : null}
              <ReviewBadge status={extraction.status === "ok" ? "confirmed" : "rejected"} className={extraction.status === "ok" ? "hidden" : ""} />
            </p>
            {extraction.status === "failed" ? (
              <p className="rounded-lg bg-flame-tint px-2 py-1.5 text-flame-strong">Reading failed: {extraction.error}</p>
            ) : null}
            <p>
              {extraction.validation.citationsChecked} citations checked,{" "}
              {extraction.validation.citationsRejected} rejected · {extraction.validation.droppedClaims} claims dropped ·{" "}
              {extraction.validation.unverifiedExcerpts} excerpts not found in the original
            </p>
            {extraction.validation.warnings.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {extraction.validation.warnings.slice(0, 4).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            {extraction.translationEn && extraction.detectedLanguage !== "en" ? (
              <p className="rounded-lg bg-sand px-2 py-1.5 text-foreground">
                <span className="font-medium">English translation the model produced: </span>
                {extraction.translationEn}
              </p>
            ) : null}
            {extraction.transcript ? (
              <p className="rounded-lg bg-violet-tint px-2 py-1.5 text-violet-strong">
                <span className="font-medium">Voice note transcript (read by AI): </span>
                {extraction.transcript}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Nothing has been read from this report yet.
          </p>
        )}

        {claims.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            No claims were extracted. A reviewer can still read the original above and act on it.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {claims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} active={active === claim.id} onActivate={setActive} />
            ))}
          </ul>
        )}

        {extraction && extraction.missingInformation.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">What the report does not say</h3>
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {extraction.missingInformation.slice(0, 8).map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {activeClaim?.excerpt ? (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-tint px-4 py-3 text-xs text-amber-strong">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              The highlighted words in the original are the source of “{activeClaim.statementEn}”.
            </span>
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-muted-foreground">{term}:</dt>
      <dd className={cn("font-medium")}>{children}</dd>
    </div>
  );
}
