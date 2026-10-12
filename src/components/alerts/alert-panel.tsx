"use client";

// Alert drafting and approval (feature M11, should-have S2).
//
// Three things this screen has to make obvious, because they are the promise the product makes:
//   • a draft is built only from confirmed facts;
//   • every sentence shows the sources it rests on, and the app — not the model — decides what
//     those sources are;
//   • approving records a person's name, and nothing is ever sent anywhere.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, FileText, Info, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { OriginBadge, ReviewBadge } from "@/components/av/trust-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AlertDraft } from "@/lib/domain/schemas";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface AlertPanelProps {
  incidentId: string;
  draft: AlertDraft | null;
  readiness: { ready: boolean; reason?: string };
  confirmedClaims: number;
  confirmedImpacts: number;
  openContradictions: number;
  /** id → a short human label, so a citation reads as a fact rather than a database key. */
  citationLabels: Record<string, string>;
  timeZone: string;
  canRunModel: boolean;
}

const STATUS_TONE: Record<AlertDraft["status"], { label: string; className: string }> = {
  draft: { label: "Draft — not approved", className: "bg-amber-tint text-amber-strong" },
  approved: { label: "Approved by a reviewer", className: "bg-leaf-tint text-leaf-strong" },
  rejected: { label: "Rejected", className: "bg-stone-tint text-stone-strong" },
  superseded: { label: "Superseded", className: "bg-stone-tint text-stone-strong" },
};

export function AlertPanel({
  incidentId,
  draft,
  readiness,
  confirmedClaims,
  confirmedImpacts,
  openContradictions,
  citationLabels,
  timeZone,
  canRunModel,
}: AlertPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [languages, setLanguages] = useState<Array<"en" | "ne">>(["en", "ne"]);

  async function post(path: string, body: unknown, key: string, success: string) {
    setBusy(key);
    setNote(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      setNote(response.ok ? success : (result.error ?? "That did not work."));
      router.refresh();
    } catch {
      setNote("That did not work. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  function toggleLanguage(code: "en" | "ne") {
    setLanguages((current) => {
      const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
      return next.length ? next : current;
    });
  }

  return (
    <section aria-labelledby="alert-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="alert-heading" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <FileText className="size-4 text-ink-soft" aria-hidden />
          Alert draft
          {draft ? (
            <>
              <Badge variant="secondary" className="rounded-full bg-sand text-xs">
                version {draft.version}
              </Badge>
              <Badge variant="secondary" className={cn("rounded-full text-xs", STATUS_TONE[draft.status].className)}>
                {STATUS_TONE[draft.status].label}
              </Badge>
            </>
          ) : null}
        </h2>

        <div className="flex flex-wrap items-center gap-1.5">
          <div role="group" aria-label="Languages" className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
            {(["en", "ne"] as const).map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={languages.includes(code)}
                onClick={() => toggleLanguage(code)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                  languages.includes(code) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {code === "en" ? "English" : "नेपाली"}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null || !readiness.ready || !canRunModel}
            onClick={() => void post(`/api/incidents/${incidentId}/alert`, { languages }, "draft", "Draft created.")}
            className="rounded-full"
          >
            {busy === "draft" ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            ) : draft ? (
              <RefreshCw className="size-3.5" aria-hidden />
            ) : (
              <FileText className="size-3.5" aria-hidden />
            )}
            {draft ? "Draft again" : "Draft an alert"}
          </Button>
        </div>
      </div>

      <p className="rounded-2xl bg-sand px-4 py-3 text-xs text-muted-foreground">
        A draft is built only from facts a reviewer has confirmed: currently {confirmedClaims} confirmed claim
        {confirmedClaims === 1 ? "" : "s"}, {confirmedImpacts} confirmed impact finding
        {confirmedImpacts === 1 ? "" : "s"}
        {openContradictions > 0 ? `, and ${openContradictions} unresolved contradiction${openContradictions === 1 ? "" : "s"}` : ""}. Every
        sentence below cites its sources. Approving records a decision — this app never sends an alert.
      </p>

      {!canRunModel ? (
        <p className="rounded-2xl bg-amber-tint px-4 py-3 text-sm text-amber-strong">
          Gemini is not configured on this deployment, so a draft cannot be written. The citations, the confirmation
          rule and the approval record behind this panel are built and tested.
        </p>
      ) : !readiness.ready ? (
        <p className="flex items-start gap-2 rounded-2xl bg-amber-tint px-4 py-3 text-sm text-amber-strong">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {readiness.reason}
        </p>
      ) : null}

      {note ? <p className="rounded-2xl bg-moss-tint px-4 py-3 text-sm text-moss-strong">{note}</p> : null}

      {draft ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <OriginBadge origin="ai" />
            <span>
              {draft.model} · {draft.promptVersion} · {formatDateTime(draft.createdAt, timeZone)}
            </span>
            <span>· prepared by {draft.createdBy.name}</span>
          </div>

          {draft.validation.removedSentences > 0 || draft.validation.warnings.length > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-xl bg-amber-tint px-3 py-2.5 text-xs text-amber-strong">
              <p className="flex items-center gap-2 font-medium">
                <TriangleAlert className="size-3.5" aria-hidden />
                {draft.validation.removedSentences} sentence
                {draft.validation.removedSentences === 1 ? "" : "s"} removed by the citation and number checks
              </p>
              {draft.validation.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-4">
            {draft.sections.map((section) => (
              <div key={section.key} className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</h3>
                {section.sentences.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing confirmed for this section yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {section.sentences.map((sentence, index) => (
                      <li key={`${section.key}-${index}`} className="flex flex-col gap-1 border-l-2 border-border pl-3">
                        <p className="text-sm">{sentence.text}</p>
                        {sentence.textNe ? (
                          <p className="text-sm text-muted-foreground" lang="ne">
                            {sentence.textNe}
                          </p>
                        ) : null}
                        <ul className="flex flex-wrap items-center gap-1.5">
                          {sentence.citations.map((citation) => (
                            <li key={`${citation.type}-${citation.id}`}>
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-sand px-2 py-0.5 text-xs text-muted-foreground"
                                title={`${citation.type}: ${citation.id}`}
                              >
                                {citation.type === "claim" ? "Claim" : citation.type === "impact" ? "Impact" : "Contradiction"}:{" "}
                                {citationLabels[citation.id] ?? citation.id}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-sand px-3 py-2.5 text-xs">
            <p className="font-medium">Sources the app attached</p>
            <p className="text-muted-foreground">
              {draft.sources.claimIds.length} claim{draft.sources.claimIds.length === 1 ? "" : "s"} ·{" "}
              {draft.sources.impactCandidateIds.length} impact finding
              {draft.sources.impactCandidateIds.length === 1 ? "" : "s"} ·{" "}
              {draft.sources.contradictionIds.length} contradiction
              {draft.sources.contradictionIds.length === 1 ? "" : "s"}. Listed here by the application, not by the
              model.
            </p>
          </div>

          {draft.status === "draft" ? (
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                disabled={busy !== null}
                className="rounded-full"
                onClick={() => void post(`/api/alerts/${draft.id}/decision`, { decision: "approved" }, "approve", "Draft approved. Nothing was sent.")}
              >
                {busy === "approve" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <CircleCheck className="size-3.5" aria-hidden />}
                Approve this draft
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                className="rounded-full text-muted-foreground"
                onClick={() => void post(`/api/alerts/${draft.id}/decision`, { decision: "rejected" }, "reject", "Draft rejected.")}
              >
                <CircleX className="size-3.5" aria-hidden />
                Reject
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <ReviewBadge status={draft.status === "approved" ? "confirmed" : "rejected"} by={draft.decision?.byName} />
              {draft.decision ? (
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(draft.decision.at, timeZone)}
                  {draft.decision.note ? ` · ${draft.decision.note}` : ""} · Nothing was sent.
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-sm text-muted-foreground">
          No draft yet. Once claims are confirmed, drafting produces a short situation summary with a citation on every
          sentence — anything the checks cannot trace back to a confirmed fact is dropped before you see it.
        </p>
      )}
    </section>
  );
}
