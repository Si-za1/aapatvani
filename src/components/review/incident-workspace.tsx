"use client";

// The incident workspace (features M4/M6/M7/M8). This is where a reviewer settles the things the
// system only proposes: which reports belong together, whether a suggested match is right, and what
// to do about a contradiction.
//
// The score breakdown is shown next to every suggestion, because the rule is that a similarity
// number never merges anything on its own, a person has to see why the system thinks two reports
// are related before deciding.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, CircleX, Copy, Merge, Mic, Split, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MemberView {
  reportId: string;
  referenceCode: string;
  membership: "suggested" | "confirmed";
  copyOf?: string;
  copyReasons?: string[];
  text: string;
  uiLanguage: "en" | "ne";
  submittedAt: string;
  hazards: string[];
  claimCount: number;
  unreviewedClaims: number;
  /**
   * The media the report carries. A photograph of the blocked road and a voice note saying so ARE
   * the evidence for the claims built from them, and the report workspace has always shown them —
   * the incident did not, so a reviewer deciding whether an incident stands was reading summaries of
   * evidence they could not see.
   */
  media: Array<{ id: string; kind: "photo" | "audio"; mimeType: string; durationSec?: number }>;
}

export interface SuggestionView {
  id: string;
  reportIds: string[];
  score: number;
  status: "pending" | "accepted" | "rejected";
  copySuspected: boolean;
  copyReasons: string[];
  features: {
    distanceKm: number | null;
    effectiveDistanceKm: number | null;
    hoursApart: number | null;
    hazardMatch: string;
    semanticSimilarity: number | null;
    lexicalSimilarity: number;
    sharedMedia: boolean;
    sameReporter: boolean;
    unavailable: string[];
  };
  ai?: { verdict: string; rationale: string; agreements: Array<{ text: string }>; conflicts: Array<{ text: string }>; model: string; citationsRejected: number };
}

export interface ContradictionView {
  id: string;
  kind: string;
  detectedBy: "rule" | "ai";
  description: string;
  status: "open" | "resolved" | "dismissed";
  claimIds: string[];
  model?: string;
  resolution?: { byName: string; note?: string };
}

const VERDICT_LABEL: Record<string, string> = {
  likely_same: "Probably the same incident",
  possibly_same: "Possibly the same incident",
  likely_different: "Probably a different incident",
  insufficient_information: "Not enough information to say",
};

export function IncidentWorkspace({
  incidentId,
  members,
  suggestions,
  contradictions,
  reportLabels,
  canRunModel,
  section = "all",
}: {
  incidentId: string;
  members: MemberView[];
  suggestions: SuggestionView[];
  contradictions: ContradictionView[];
  reportLabels: Record<string, string>;
  canRunModel: boolean;
  /** This part of the workspace is shown on its own tab, rather than the whole thing at once. */
  section?: "all" | "evidence" | "grouping";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showDecided, setShowDecided] = useState(false);

  async function post(path: string, body: unknown, key: string, successNote: string) {
    setBusy(key);
    setNote(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) setNote(result.error ?? "That did not save.");
      else setNote(successNote);
      router.refresh();
    } catch {
      setNote("That did not save. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  const pending = suggestions.filter((s) => s.status === "pending");
  const decided = suggestions.filter((s) => s.status !== "pending");
  const openContradictions = contradictions.filter((c) => c.status === "open");
  const settledContradictions = contradictions.filter((c) => c.status !== "open");

  return (
    <div className="flex flex-col gap-6">
      {note ? <p className="rounded-2xl bg-moss-tint px-4 py-3 text-sm text-moss-strong">{note}</p> : null}

      <section
        aria-labelledby="members-heading"
        className={cn("flex-col gap-3", section === "grouping" ? "hidden" : "flex")}
      >
        <h2 id="members-heading" className="text-sm font-semibold">
          Reports in this incident
          <span className="ml-2 font-normal text-muted-foreground">
            {members.length} report{members.length === 1 ? "" : "s"}
          </span>
        </h2>

        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li key={member.reportId} className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/reports/${member.reportId}`} className="font-mono text-xs font-medium text-ink-soft hover:underline">
                  {member.referenceCode}
                </Link>
                <Badge
                  variant="secondary"
                  className={cn(
                    "rounded-full text-xs",
                    member.membership === "confirmed" ? "bg-leaf-tint text-leaf-strong" : "bg-amber-tint text-amber-strong",
                  )}
                >
                  {member.membership === "confirmed" ? "Membership confirmed" : "Membership suggested"}
                </Badge>
                {member.copyOf ? (
                  <Badge variant="secondary" className="rounded-full bg-stone-tint text-xs text-stone-strong">
                    <Copy className="size-3" aria-hidden />
                    Copy, not an independent source
                  </Badge>
                ) : null}
                <span className="ml-auto text-xs text-muted-foreground">
                  {member.claimCount} claims · {member.unreviewedClaims} unreviewed
                </span>
              </div>

              <p className="line-clamp-2 text-sm text-muted-foreground" lang={member.uiLanguage}>
                {member.text || "(no text)"}
              </p>

              {/* The evidence itself. A photograph of the blocked road and a voice note saying so are
                  what the claims were built from, and they were only visible in the report workspace —
                  so a reviewer deciding whether this incident stands was reading summaries of evidence
                  they could not see. Served through the session-checked media route, never a public URL. */}
              {member.media.length > 0 ? (
                <div className="flex flex-wrap items-start gap-2.5">
                  {member.media.map((item) =>
                    item.kind === "photo" ? (
                      <a
                        key={item.id}
                        href={`/api/media/${member.reportId}/${item.id}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Open the full photograph"
                        className="block transition-opacity hover:opacity-90"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/media/${member.reportId}/${item.id}`}
                          alt="Photograph attached to this report"
                          className="size-[92px] rounded-xl border border-border object-cover"
                        />
                      </a>
                    ) : (
                      // `min-w-0` because an <audio> element carries a ~300 px intrinsic width that a
                      // flex box treats as a floor, which would widen the card past its column.
                      <div key={item.id} className="flex min-w-0 flex-col gap-1">
                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Mic className="size-3" aria-hidden />
                          Voice note{item.durationSec ? ` · ${Math.round(item.durationSec)} s` : ""}
                        </span>
                        <audio
                          src={`/api/media/${member.reportId}/${item.id}`}
                          controls
                          className="h-8 w-full min-w-0 max-w-[260px]"
                        />
                      </div>
                    ),
                  )}
                </div>
              ) : null}

              {member.copyReasons?.length ? (
                <p className="rounded-lg bg-stone-tint px-2.5 py-1.5 text-xs text-stone-strong">{member.copyReasons.join(" ")}</p>
              ) : null}

              <div className="flex flex-wrap gap-1.5">
                {member.membership === "suggested" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    className="rounded-full"
                    onClick={() =>
                      void post(
                        `/api/incidents/${incidentId}/members`,
                        { reportId: member.reportId, decision: "confirmed" },
                        `confirm:${member.reportId}`,
                        "Membership confirmed.",
                      )
                    }
                  >
                    <Check className="size-3.5" aria-hidden />
                    Keep in this incident
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  className="rounded-full text-muted-foreground"
                  onClick={() =>
                    void post(
                      `/api/incidents/${incidentId}/members`,
                      { reportId: member.reportId, moveToIncidentId: null },
                      `remove:${member.reportId}`,
                      "Report taken out of this incident.",
                    )
                  }
                >
                  <Split className="size-3.5" aria-hidden />
                  Take out
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="suggestions-heading"
        className={cn("flex-col gap-3", section === "evidence" ? "hidden" : "flex")}
      >
        <h2 id="suggestions-heading" className="text-sm font-semibold">
          Suggested matches
          <span className="ml-2 font-normal text-muted-foreground">
            {pending.length} waiting for a decision
          </span>
        </h2>

        {!canRunModel ? (
          <p className="rounded-2xl bg-amber-tint px-4 py-3 text-sm text-amber-strong">
            Automatic reading is not available here, so these suggestions were made on computed features alone —
            distance, time, wording and hazard. The comparison half is absent rather than guessed.
          </p>
        ) : null}

        {pending.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-4 text-sm text-muted-foreground">
            No suggested matches are waiting.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                reportLabels={reportLabels}
                busy={busy !== null}
                onDecide={(decision) =>
                  void post(
                    `/api/suggestions/${suggestion.id}/decision`,
                    { decision },
                    `suggestion:${suggestion.id}`,
                    decision === "accepted" ? "Reports merged into one incident." : "Suggestion rejected.",
                  )
                }
              />
            ))}
          </ul>
        )}

        {decided.length > 0 ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowDecided((value) => !value)}
              className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:underline"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", showDecided && "rotate-180")} aria-hidden />
              {decided.length} suggestion{decided.length === 1 ? "" : "s"} already decided
            </button>
            {showDecided ? (
              <ul className="flex flex-col gap-2">
                {decided.map((suggestion) => (
                  <li key={suggestion.id} className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
                    <span className="font-medium">
                      {suggestion.reportIds.map((id) => reportLabels[id] ?? id).join(" ↔ ")}
                    </span>
                    <span className="ml-2 text-muted-foreground">{suggestion.status}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="contradictions-heading"
        className={cn("flex-col gap-3", section === "evidence" ? "hidden" : "flex")}
      >
        <h2 id="contradictions-heading" className="text-sm font-semibold">
          Contradictions
          <span className="ml-2 font-normal text-muted-foreground">
            {openContradictions.length} open
          </span>
        </h2>

        {contradictions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-4 text-sm text-muted-foreground">
            The reports in this incident do not disagree on anything the system can check.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...openContradictions, ...settledContradictions].map((contradiction) => (
              <li
                key={contradiction.id}
                className={cn(
                  "flex flex-col gap-2.5 rounded-2xl border p-4",
                  contradiction.status === "open" ? "border-flame/50 bg-flame-tint" : "border-border bg-card",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "rounded-full text-xs",
                      contradiction.status === "open" ? "bg-flame text-flame-strong" : "bg-stone-tint text-stone-strong",
                    )}
                  >
                    {contradiction.kind.replace("_", " ")}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full bg-sand text-xs">
                    {contradiction.detectedBy === "ai" ? `Found by ${contradiction.model ?? "AI"}` : "Found by a rule"}
                  </Badge>
                  {contradiction.status !== "open" ? (
                    <span className="text-xs text-muted-foreground">
                      {contradiction.status} by {contradiction.resolution?.byName}
                    </span>
                  ) : null}
                </div>

                <p className={cn("text-sm", contradiction.status === "open" ? "text-flame-strong" : "text-muted-foreground")}>
                  {contradiction.description}
                </p>

                {contradiction.status === "open" ? (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      className="rounded-full"
                      onClick={() =>
                        void post(
                          `/api/contradictions/${contradiction.id}/decision`,
                          { decision: "resolved" },
                          `contradiction:${contradiction.id}`,
                          "Contradiction resolved.",
                        )
                      }
                    >
                      <Check className="size-3.5" aria-hidden />
                      Resolved
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      className="rounded-full text-muted-foreground"
                      onClick={() =>
                        void post(
                          `/api/contradictions/${contradiction.id}/decision`,
                          { decision: "dismissed" },
                          `contradiction:${contradiction.id}`,
                          "Contradiction dismissed.",
                        )
                      }
                    >
                      <CircleX className="size-3.5" aria-hidden />
                      Not a real conflict
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  reportLabels,
  busy,
  onDecide,
}: {
  suggestion: SuggestionView;
  reportLabels: Record<string, string>;
  busy: boolean;
  onDecide: (decision: "accepted" | "rejected") => void;
}) {
  const { features } = suggestion;
  const parts: Array<{ label: string; detail: string; value: number | null }> = [
    {
      label: "Distance",
      detail: features.effectiveDistanceKm === null ? "no location for one report" : `${features.effectiveDistanceKm.toFixed(1)} km apart, allowing for accuracy`,
      value: features.effectiveDistanceKm === null ? null : 1 - Math.min(1, (features.effectiveDistanceKm * 1000) / 5000),
    },
    {
      label: "Time",
      detail: features.hoursApart === null ? "submission times unavailable" : `${features.hoursApart.toFixed(1)} h apart`,
      value: features.hoursApart === null ? null : 1 - Math.min(1, features.hoursApart / 24),
    },
    { label: "Hazard", detail: `categories are ${features.hazardMatch}`, value: null },
    {
      label: "Meaning",
      detail: features.semanticSimilarity === null ? "no embedding available" : `embedding similarity ${features.semanticSimilarity.toFixed(2)}`,
      value: features.semanticSimilarity === null ? null : Math.max(0, (features.semanticSimilarity - 0.55) / 0.45),
    },
    { label: "Wording", detail: `${Math.round(features.lexicalSimilarity * 100)}% of 5-character sequences shared`, value: features.lexicalSimilarity },
  ];

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {suggestion.reportIds.map((id) => reportLabels[id] ?? id).join(" ↔ ")}
        </span>
        <Badge variant="secondary" className="rounded-full bg-moss-tint text-xs text-moss-strong">
          {Math.round(suggestion.score * 100)}% match
        </Badge>
        {suggestion.copySuspected ? (
          <Badge variant="secondary" className="rounded-full bg-stone-tint text-xs text-stone-strong">
            <TriangleAlert className="size-3" aria-hidden />
            Looks like a copy
          </Badge>
        ) : null}
      </div>

      {suggestion.ai ? (
        <div className="flex flex-col gap-1.5 rounded-xl bg-violet-tint px-3 py-2.5 text-sm text-violet-strong">
          <p className="font-medium">{VERDICT_LABEL[suggestion.ai.verdict] ?? suggestion.ai.verdict}</p>
          <p>{suggestion.ai.rationale}</p>
          {suggestion.ai.agreements.length > 0 ? (
            <p className="text-xs">They agree on: {suggestion.ai.agreements.map((a) => a.text).join("; ")}</p>
          ) : null}
          {suggestion.ai.conflicts.length > 0 ? (
            <p className="text-xs">They disagree on: {suggestion.ai.conflicts.map((c) => c.text).join("; ")}</p>
          ) : null}
        </div>
      ) : null}

      <details className="text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground">Why this score</summary>
        <ul className="mt-2 flex flex-col gap-1.5">
          {parts.map((part) => (
            <li key={part.label} className="flex items-center gap-2">
              <span className="w-16 shrink-0 font-medium text-foreground">{part.label}</span>
              <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-sand">
                <span
                  className="block h-full rounded-full bg-moss-strong/70"
                  style={{ width: `${Math.round((part.value ?? 0) * 100)}%` }}
                />
              </span>
              <span className="text-muted-foreground">{part.detail}</span>
            </li>
          ))}
        </ul>
        {features.sharedMedia ? <p className="mt-2 text-muted-foreground">The same file is attached to both reports.</p> : null}
        {features.sameReporter ? <p className="mt-1 text-muted-foreground">Both came from the same device token.</p> : null}
      </details>

      {suggestion.copyReasons.length > 0 ? (
        <p className="rounded-lg bg-stone-tint px-2.5 py-2 text-xs text-stone-strong">{suggestion.copyReasons.join(" ")}</p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" disabled={busy} onClick={() => onDecide("accepted")} className="rounded-full">
          <Merge className="size-3.5" aria-hidden />
          Same incident
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide("rejected")} className="rounded-full">
          <Split className="size-3.5" aria-hidden />
          Different incidents
        </Button>
      </div>
    </li>
  );
}
