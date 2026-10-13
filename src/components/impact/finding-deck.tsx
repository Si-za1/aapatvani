"use client";

// The findings, one at a time.
//
// A road analysis produces a dozen or more findings, and the old shape was all of them at once: a
// column of cards each with the same two buttons, where the only way to know how much was left was
// to scroll. This is the same work as a deck — one finding in front of you, a bar saying how far
// through you are, and backwards and forwards — which makes it obvious both what you are deciding
// and how much deciding is left.
//
// Deciding moves you on by itself. A reviewer who has read a finding and pressed Confirm has told us
// everything we need about it; making them press Next as well is a second action for the same
// thought.
//
// The three cards behind are drawn, not faked: they are the finding after this one, and the one
// after that, so the depth on screen is the work remaining.

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleSlash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ImpactCandidate } from "@/lib/domain/schemas";
import { cn } from "@/lib/utils";

const FINDING_LABEL: Record<ImpactCandidate["finding"], string> = {
  possibly_blocked: "Road possibly blocked",
  lost_access: "Loses road access to care",
  longer_route: "Route to care becomes longer",
  catchment_affected: "Health facility catchment changes",
  nearby: "Nearby, not assumed affected",
};

export function FindingDeck({
  candidates,
  busy,
  disabled,
  onReview,
}: {
  /** Only the findings still waiting on a person, in the order the panel grouped them. */
  candidates: ImpactCandidate[];
  busy: boolean;
  disabled: boolean;
  onReview: (id: string, decision: "confirmed" | "dismissed") => void;
}) {
  const [index, setIndex] = useState(0);
  const current = candidates[Math.min(index, candidates.length - 1)];

  if (!current) return null;

  const total = candidates.length;
  const position = Math.min(index, total - 1);

  function decide(decision: "confirmed" | "dismissed") {
    onReview(current.id, decision);
    // The list shrinks underneath us as findings are decided, so the next one moves up into this
    // position on its own; only the last one needs the index walked back.
    if (position >= total - 1) setIndex(Math.max(0, total - 2));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* How far through, and how much is left. One segment per finding still waiting. */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1" role="progressbar" aria-valuenow={position + 1} aria-valuemin={1} aria-valuemax={total}>
          {candidates.map((candidate, i) => (
            <span
              key={candidate.id}
              aria-hidden
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= position ? "bg-ink" : "bg-border",
              )}
            />
          ))}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {position + 1} of {total}
        </span>
      </div>

      {/* The deck. The cards behind are the finding after this one, and the one after that. */}
      <div className="relative">
        {[2, 1].map((depth) =>
          position + depth < total ? (
            <span
              key={depth}
              aria-hidden
              className="absolute inset-x-0 rounded-3xl border border-border bg-card"
              style={{
                // A card below the one in front, inset on both sides and showing past the bottom
                // edge, so the depth on screen is the work left rather than decoration.
                top: `${depth * 11}px`,
                bottom: `${-depth * 9}px`,
                left: `${depth * 16}px`,
                right: `${depth * 16}px`,
              }}
            />
          ) : null,
        )}

        <article className="relative flex min-h-[15rem] flex-col rounded-3xl border border-border bg-card p-5 shadow-[0_12px_32px_-18px_rgba(28,31,24,0.28)]">
          {/* Two lines of heading, then the claim, then the evidence for it. Everything else is
              behind a summary, because this card exists to be decided on, not read from end to end,
              and a card whose height changes with every finding makes the stack jump under the
              cursor. */}
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {FINDING_LABEL[current.finding]}
              </p>
              <h4 className="text-lg leading-snug font-bold tracking-tight">{current.name}</h4>
            </div>
            {current.assetKind ? (
              <Badge variant="secondary" className="shrink-0 rounded-full bg-sand text-xs">
                {current.assetSubtype ?? current.assetKind}
              </Badge>
            ) : null}
          </header>

          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {current.explanation}
          </p>

          {current.access?.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {current.access.map((access) => (
                <li
                  key={access.target}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    access.status === "lost"
                      ? "bg-flame-tint text-flame-strong"
                      : access.status === "longer"
                        ? "bg-amber-tint text-amber-strong"
                        : access.status === "not_connected"
                          ? "bg-stone-tint text-stone-strong"
                          : "bg-leaf-tint text-leaf-strong",
                  )}
                >
                  {access.target === "hospital" ? "To a hospital" : "To any facility"}
                  <span className="font-normal opacity-75">
                    {access.status === "lost"
                      ? "no route left"
                      : access.status === "longer"
                        ? "much longer"
                        : access.status === "not_connected"
                          ? "already cut off"
                          : "unchanged"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {current.caveats.length ? (
            <details className="group mt-3 text-xs">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground">
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                {current.caveats.length} caveat{current.caveats.length === 1 ? "" : "s"} on this finding
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5 text-muted-foreground">
                {current.caveats.map((caveat) => (
                  <li key={caveat} className="flex gap-2">
                    <span aria-hidden className="text-border">
                      •
                    </span>
                    {caveat}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {/* The decisions, and the two directions. Deciding is the loud pair; moving through the
              deck is quiet, because it changes nothing. */}
          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
            <Button type="button" onClick={() => decide("confirmed")} disabled={disabled} className="rounded-full">
              <Check className="size-4" aria-hidden />
              Confirm
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => decide("dismissed")}
              disabled={disabled}
              className="rounded-full"
            >
              <CircleSlash className="size-4" aria-hidden />
              Dismiss
            </Button>

            <span className="ml-auto flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Previous finding"
                onClick={() => setIndex(Math.max(0, position - 1))}
                disabled={position === 0}
                className="rounded-full"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Next finding"
                onClick={() => setIndex(Math.min(total - 1, position + 1))}
                disabled={position >= total - 1}
                className="rounded-full"
              >
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </span>
          </div>

          {busy ? <p className="mt-2 text-xs text-muted-foreground">Saving…</p> : null}
        </article>
      </div>
    </div>
  );
}
