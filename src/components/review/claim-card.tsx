"use client";

// One extracted claim with its review actions (feature M4).
//
// The claim text shown is the model's or the reporter's — never a rewritten one. A reviewer's
// correction goes into `editedStatement`, which sits beside the original rather than replacing it,
// so the difference between "what was said" and "what a person concluded" survives in the record.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleX, LoaderCircle, PencilLine, TriangleAlert, X } from "lucide-react";
import { OriginBadge, ReviewBadge } from "@/components/av/trust-labels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewStatus } from "@/lib/domain/schemas";
import { cn } from "@/lib/utils";

export interface ClaimView {
  id: string;
  type: string;
  statement: string;
  statementEn: string;
  origin: "reporter" | "ai" | "computed" | "reviewer";
  basis: string;
  excerpt?: { text: string; verified: boolean; start?: number; end?: number };
  hazardCategory?: string;
  roadStatus?: string;
  roadName?: string;
  people?: { kind: string; count?: number };
  place?: { text: string; resolved?: { name: string; matchType: string } };
  time?: { text: string; interpretedStart?: string; interpretedEnd?: string };
  modelCertainty?: string;
  review: { status: ReviewStatus; by?: { name: string }; at?: string; note?: string };
  editedStatement?: string;
}

const TYPE_LABEL: Record<string, string> = {
  hazard: "Hazard",
  event: "What happened",
  location: "Location",
  time: "Time",
  impact_road: "Road impact",
  impact_people: "People",
  impact_structure: "Structures",
  impact_service: "Services",
  need: "Need",
  observation: "Observation",
  other: "Other",
};

export function ClaimCard({
  claim,
  active,
  onActivate,
}: {
  claim: ClaimView;
  active: boolean;
  onActivate: (id: string | null) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<ReviewStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "edit" | "note">("idle");
  const [draft, setDraft] = useState(claim.editedStatement ?? "");

  async function decide(status: ReviewStatus, options: { note?: string; editedStatement?: string } = {}) {
    setPending(status);
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claim.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, ...options }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "That did not save.");
        return;
      }
      setMode("idle");
      router.refresh();
    } catch {
      setError("That did not save. Check your connection.");
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;
  const shown = claim.editedStatement ?? (claim.statementEn || claim.statement);

  return (
    <li
      className={cn(
        "flex flex-col gap-2.5 rounded-2xl border bg-card p-3.5 transition-colors",
        active ? "border-amber ring-1 ring-amber" : "border-border",
      )}
      onMouseEnter={() => onActivate(claim.id)}
      onMouseLeave={() => onActivate(null)}
      onFocus={() => onActivate(claim.id)}
      onBlur={() => onActivate(null)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-medium">{TYPE_LABEL[claim.type] ?? claim.type}</span>
        <OriginBadge origin={claim.origin} />
        <ReviewBadge status={claim.review.status} by={claim.review.by?.name} />
      </div>

      <p className="text-sm">{shown}</p>

      {claim.editedStatement ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">As read by the system: </span>
          {claim.statementEn}
        </p>
      ) : null}

      {claim.excerpt ? (
        <p
          className={cn(
            "rounded-lg px-2 py-1.5 text-xs",
            claim.excerpt.verified ? "bg-coral-tint text-coral-strong" : "bg-amber-tint text-amber-strong",
          )}
        >
          <span className="font-medium">{claim.excerpt.verified ? "From the original: " : "Not found in the original: "}</span>
          “{claim.excerpt.text}”
        </p>
      ) : null}

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {claim.roadStatus ? (
          <div className="flex gap-1">
            <dt>Road:</dt>
            <dd className="font-medium text-foreground">
              {claim.roadStatus.replace("_", " ")}
              {claim.roadName ? ` · ${claim.roadName}` : ""}
            </dd>
          </div>
        ) : null}
        {claim.people ? (
          <div className="flex gap-1">
            <dt>People:</dt>
            <dd className="font-medium text-foreground">
              {claim.people.count !== undefined ? `${claim.people.count} ` : ""}
              {claim.people.kind.replace("_", " ")}
            </dd>
          </div>
        ) : null}
        {claim.place ? (
          <div className="flex gap-1">
            <dt>Place:</dt>
            <dd className="font-medium text-foreground">
              {claim.place.resolved ? claim.place.resolved.name : `${claim.place.text} (not matched to the map)`}
            </dd>
          </div>
        ) : null}
        {claim.time?.interpretedStart ? (
          <div className="flex gap-1">
            <dt>Time:</dt>
            <dd className="font-medium text-foreground">{claim.time.text}</dd>
          </div>
        ) : null}
        {claim.modelCertainty ? (
          <div className="flex gap-1">
            <dt>Model certainty:</dt>
            <dd>{claim.modelCertainty}</dd>
          </div>
        ) : null}
      </dl>

      {claim.review.note ? (
        <p className="rounded-lg bg-sand px-2 py-1.5 text-xs">
          <span className="font-medium">Reviewer note: </span>
          {claim.review.note}
        </p>
      ) : null}

      {mode === "edit" ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            maxLength={2000}
            aria-label="Corrected statement"
            className="min-h-0 text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void decide("edited", { editedStatement: draft })}>
              {pending === "edited" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
              Save correction
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              <X className="size-3.5" aria-hidden />
              Cancel
            </Button>
          </div>
        </div>
      ) : mode === "note" ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="What is missing or unclear?"
            aria-label="Note"
            className="min-h-0 text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void decide("needs_info", { note: draft })}>
              {pending === "needs_info" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
              Save note
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              <X className="size-3.5" aria-hidden />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide("confirmed")} className="rounded-full">
            <Check className="size-3.5" aria-hidden />
            Confirm
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setDraft(claim.editedStatement ?? claim.statementEn);
              setMode("edit");
            }}
            className="rounded-full"
          >
            <PencilLine className="size-3.5" aria-hidden />
            Correct
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setDraft("");
              setMode("note");
            }}
            className="rounded-full"
          >
            <TriangleAlert className="size-3.5" aria-hidden />
            Needs information
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void decide("rejected")}
            className="rounded-full text-muted-foreground"
          >
            <CircleX className="size-3.5" aria-hidden />
            Reject
          </Button>
        </div>
      )}

      {error ? <p className="text-xs text-flame-strong">{error}</p> : null}
    </li>
  );
}
