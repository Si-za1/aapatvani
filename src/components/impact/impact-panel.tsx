"use client";

// The Blast Radius panel (features M9/S5/S7). Deterministic geography, shown with its working:
// which road is assumed blocked, which settlements lose a route to care, and what the analysis
// cannot say.
//
// Two rules show up in the layout. Every finding carries its own caveats next to it, not in a
// footnote, because "this road is unmapped" changes how much the finding is worth. And the
// plain-language summary is labelled as an AI restatement that may have been rejected, it can
// never add a finding of its own.

import { useState } from "react";
import { Dumbbell } from "@/components/charts/dumbbell";
import { ImpactRose } from "@/components/impact/impact-rose";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  CircleX,
  Info,
  LoaderCircle,
  Play,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { OriginBadge, ReviewBadge } from "@/components/av/trust-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ImpactAssessment, ImpactCandidate } from "@/lib/domain/schemas";
import { formatDateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const FINDING_ORDER: ImpactCandidate["finding"][] = [
  "possibly_blocked",
  "lost_access",
  "longer_route",
  "catchment_affected",
  "nearby",
];

const FINDING_LABEL: Record<ImpactCandidate["finding"], string> = {
  possibly_blocked: "Road possibly blocked",
  lost_access: "Places that lose road access to care",
  longer_route: "Places whose route to care becomes much longer",
  catchment_affected: "Health facilities whose catchment changes",
  nearby: "Nearby, being close does not mean affected",
};

export interface ImpactPanelProps {
  incidentId: string;
  assessment: ImpactAssessment | null;
  history: Array<{ id: string; version: number; createdAt: string; createdBy: string; status: string; candidates: number }>;
  timeZone: string;
  /**
   * The moment this page was rendered, passed in rather than read here. `relativeTime` falls back to
   * the clock, and this is a Client Component: the server would say "2 h ago" and the browser would
   * say "2 h ago" a few milliseconds later, which is enough for React to throw the whole tree away
   * and re-render it, and for the page to flicker on every load.
   */
  now: string;
  canRunModel: boolean;
  /** Renders the map; passed in so the Leaflet bundle stays out of this component. */
  map: React.ReactNode;
}

export function ImpactPanel({ incidentId, assessment, history, timeZone, now, canRunModel, map }: ImpactPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showReviewed, setShowReviewed] = useState(false);

  async function run() {
    setBusy("run");
    setNote(null);
    try {
      const response = await fetch(`/api/incidents/${incidentId}/impact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ withExplanation: canRunModel }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; assessment?: { statusMessage: string } };
      setNote(response.ok ? (body.assessment?.statusMessage ?? "Analysis complete.") : (body.error ?? "That did not run."));
      router.refresh();
    } catch {
      setNote("That did not run. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  async function review(candidateId: string, decision: "confirmed" | "dismissed") {
    setBusy(candidateId);
    setNote(null);
    try {
      const response = await fetch(`/api/impacts/${assessment!.id}/candidates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId, decision }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setNote(response.ok ? (decision === "confirmed" ? "Finding confirmed." : "Finding dismissed.") : (body.error ?? "That did not save."));
      router.refresh();
    } catch {
      setNote("That did not save. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  const runButton = (
    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run()} className="rounded-full">
      {busy === "run" ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
      ) : assessment ? (
        <RefreshCw className="size-3.5" aria-hidden />
      ) : (
        <Play className="size-3.5" aria-hidden />
      )}
      {assessment ? "Run again" : "Run the analysis"}
    </Button>
  );

  if (!assessment) {
    return (
      <section aria-labelledby="impact-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="impact-heading" className="text-sm font-semibold">
            Impact analysis
          </h2>
          {runButton}
        </div>
        {note ? <p className="rounded-2xl bg-moss-tint px-4 py-3 text-sm text-moss-strong">{note}</p> : null}
        <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-sm text-muted-foreground">
          This runs a road-access analysis over the OpenStreetMap extract: if the road a report describes as
          blocked really were blocked, which settlements would keep a route to a health facility and which would
          lose one. It is a deterministic calculation, not a prediction, and it never estimates casualties or
          damage.
        </p>
      </section>
    );
  }

  const unreviewed = assessment.candidates.filter((c) => c.review.status === "unreviewed");
  const reviewed = assessment.candidates.filter((c) => c.review.status !== "unreviewed");
  const confirmed = assessment.candidates.filter((c) => c.review.status === "confirmed" || c.review.status === "edited");

  const groups = FINDING_ORDER.map((finding) => ({
    finding,
    items: unreviewed.filter((c) => c.finding === finding),
  })).filter((group) => group.items.length > 0);

  return (
    <section aria-labelledby="impact-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="impact-heading" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          Impact analysis
          <Badge variant="secondary" className="rounded-full bg-sand text-xs">
            version {assessment.version}
          </Badge>
          <OriginBadge origin="computed" />
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {runButton}
          {history.length > 1 ? (
            <button
              type="button"
              onClick={() => setShowHistory((value) => !value)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:underline"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", showHistory && "rotate-180")} aria-hidden />
              {history.length} versions
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-sm">{assessment.statusMessage}</p>

      {showHistory ? (
        <ul className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-3 text-xs">
          {history.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">v{entry.version}</span>
              <span className="text-muted-foreground">
                {formatDateTime(entry.createdAt, timeZone)} · {entry.createdBy}
              </span>
              <span className="text-muted-foreground">
                {entry.candidates} finding{entry.candidates === 1 ? "" : "s"} · {entry.status}
              </span>
              {entry.id === assessment.id ? <Badge className="rounded-full bg-moss-tint text-xs text-moss-strong">showing</Badge> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {note ? <p className="rounded-2xl bg-moss-tint px-4 py-3 text-sm text-moss-strong">{note}</p> : null}

      {/* The two halves of "where": the map says which roads, the rose says how far and which way.
          Both, side by side, because either one alone leaves the reader doing the other's job. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">{map}</div>
        {assessment.inputs.location ? (
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              How far, and which way
            </h3>
            <ImpactRose
              centre={{ lat: assessment.inputs.location.lat, lng: assessment.inputs.location.lng }}
              candidates={assessment.candidates}
            />
          </div>
        ) : null}
      </div>

      {assessment.aiExplanation ? (
        <div className="flex flex-col gap-1.5 rounded-2xl bg-violet-tint px-4 py-3.5 text-sm text-violet-strong">
          <span className="flex flex-wrap items-center gap-2">
            <OriginBadge origin="ai" />
            <span className="text-xs">
              {assessment.aiExplanation.model} · a restatement of the findings above
            </span>
          </span>
          {assessment.aiExplanation.accepted ? (
            <p>{assessment.aiExplanation.text}</p>
          ) : (
            <p>
              <strong className="font-medium">Not shown: </strong>
              the model&apos;s summary was rejected by the checks ({assessment.aiExplanation.rejectionReason}). The
              computed findings above stand on their own.
            </p>
          )}
        </div>
      ) : null}

      {assessment.blockedRoads.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Road assumed blocked</h3>
          {assessment.blockedRoads.map((road) => (
            <p key={road.edge} className="text-sm">
              {road.name} <span className="text-muted-foreground">· {road.roadClass} · {Math.round(road.lengthM)} m segment, {Math.round(road.distanceM)} m from the reported location</span>
            </p>
          ))}
          {assessment.otherNearbyRoads.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Other roads nearby, not assumed blocked: {assessment.otherNearbyRoads.map((r) => r.name).join(", ")}.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Input: {assessment.inputs.blockageClaimIds.length} claim
            {assessment.inputs.blockageClaimIds.length === 1 ? "" : "s"} describing a road blockage
            {Object.values(assessment.inputs.blockageClaimStatus).length
              ? ` (${[...new Set(Object.values(assessment.inputs.blockageClaimStatus))].join(", ")})`
              : ""}
            .
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          Findings
          <span className="ml-2 font-normal text-muted-foreground">
            {confirmed.length} confirmed · {unreviewed.length} waiting
          </span>
        </h3>

        {groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-4 text-sm text-muted-foreground">
            Every finding has been reviewed.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.finding} className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {FINDING_LABEL[group.finding]} · {group.items.length}
              </h4>

              {/* The shape of the finding, before the sentences about it. Every row is one place,
                  and the length of its line is how much further the road to care became. */}
              {group.finding === "lost_access" || group.finding === "longer_route" ? (
                <Dumbbell
                  before="Route to care before"
                  after="With the blockage assumed"
                  rows={group.items
                    .filter((candidate) => candidate.kind === "settlement_access")
                    .map((candidate) => ({
                      key: candidate.id,
                      label: candidate.name,
                      detail: candidate.access?.find((entry) => entry.target === "any_health_facility")
                        ?.afterFacilityName,
                      beforeM: candidate.metrics.beforeM ?? null,
                      afterM: candidate.metrics.afterM ?? null,
                    }))}
                />
              ) : null}
              <ul className="flex flex-col gap-2">
                {group.items.slice(0, 30).map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    now={now}
                    busy={busy === candidate.id}
                    disabled={busy !== null}
                    onReview={(decision) => void review(candidate.id, decision)}
                  />
                ))}
              </ul>
              {group.items.length > 30 ? (
                <p className="text-xs text-muted-foreground">Showing 30 of {group.items.length}.</p>
              ) : null}
            </div>
          ))
        )}

        {reviewed.length > 0 ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowReviewed((value) => !value)}
              className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:underline"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", showReviewed && "rotate-180")} aria-hidden />
              {reviewed.length} finding{reviewed.length === 1 ? "" : "s"} already reviewed
            </button>
            {showReviewed ? (
              <ul className="flex flex-col gap-2">
                {reviewed.slice(0, 40).map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    now={now}
                    busy={false}
                    disabled
                    onReview={() => undefined}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {assessment.warnings.length > 0 || assessment.limitations.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-amber-tint px-4 py-3.5 text-sm text-amber-strong">
          <h3 className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="size-4" aria-hidden />
            What this analysis cannot say
          </h3>
          <ul className="flex flex-col gap-1">
            {[...assessment.limitations, ...assessment.warnings].map((warning) => (
              <li key={warning} className="flex gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function CandidateCard({
  candidate,
  now,
  busy,
  disabled,
  onReview,
}: {
  candidate: ImpactCandidate;
  /** The render moment, from the page, so the relative label matches on both sides. */
  now: string;
  busy: boolean;
  disabled: boolean;
  onReview: (decision: "confirmed" | "dismissed") => void;
}) {
  const settled = candidate.review.status !== "unreviewed";

  return (
    <li className={cn("flex flex-col gap-2 rounded-2xl border p-3.5", settled ? "border-border bg-card" : "border-border bg-card")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{candidate.name}</span>
        {settled ? <ReviewBadge status={candidate.review.status} by={candidate.review.by?.name} /> : null}
        {candidate.assetKind ? (
          <Badge variant="secondary" className="rounded-full bg-sand text-xs">
            {candidate.assetSubtype ?? candidate.assetKind}
          </Badge>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">{candidate.explanation}</p>

      {candidate.access?.length ? (
        <ul className="flex flex-col gap-1 text-xs">
          {candidate.access.map((access) => (
            <li key={access.target} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {access.target === "hospital" ? "To a hospital" : "To any health facility"}:
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium",
                  access.status === "lost"
                    ? "bg-flame-tint text-flame-strong"
                    : access.status === "longer"
                      ? "bg-amber-tint text-amber-strong"
                      : "bg-leaf-tint text-leaf-strong",
                )}
              >
                {access.status === "lost"
                  ? "no route left in this dataset"
                  : access.status === "longer"
                    ? "route much longer"
                    : access.status === "not_connected"
                      ? "already disconnected before"
                      : "unchanged"}
              </span>
              {access.beforeM !== null || access.afterM !== null ? (
                <span className="text-muted-foreground">
                  before {access.beforeM === null ? "-" : `${(access.beforeM / 1000).toFixed(1)} km`} · after{" "}
                  {access.afterM === null ? "no route" : `${(access.afterM / 1000).toFixed(1)} km`}
                  {access.beforeFacilityName ? ` · nearest was ${access.beforeFacilityName}` : ""}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {candidate.affectedSettlements?.length ? (
        <p className="text-xs text-muted-foreground">
          Affects {candidate.affectedSettlements.length} settlement{candidate.affectedSettlements.length === 1 ? "" : "s"}:{" "}
          {candidate.affectedSettlements.slice(0, 6).join(", ")}
          {candidate.affectedSettlements.length > 6 ? "…" : ""}
        </p>
      ) : null}

      {candidate.caveats.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {candidate.caveats.map((caveat) => (
            <li key={caveat} className="flex gap-2 text-xs text-amber-strong">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {caveat}
            </li>
          ))}
        </ul>
      ) : null}

      {candidate.review.status === "unreviewed" ? (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onReview("confirmed")} className="rounded-full">
            {busy ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onReview("dismissed")}
            className="rounded-full text-muted-foreground"
          >
            <CircleX className="size-3.5" aria-hidden />
            Dismiss
          </Button>
        </div>
      ) : candidate.review.at ? (
        <p className="text-xs text-muted-foreground">Reviewed {relativeTime(candidate.review.at, Date.parse(now))}</p>
      ) : null}

      {candidate.review.note ? <p className="text-xs text-muted-foreground">Note: {candidate.review.note}</p> : null}
    </li>
  );
}
