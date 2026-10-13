// One thing that happened, as a card.
//
// The surface takes the colour of whoever produced it, which is the same four-way split the rest of
// the app uses, so a screen of these can be read by scanning the tint before any of the text. The
// body stays in ordinary ink: a tint is a label here, not a background for prose.
//
// Every card is the same size. A record is read by scanning down and across, and cards that stop at
// different heights turn a grid into a ragged edge that the eye has to re-find on every row. The body
// is therefore clipped to a fixed number of lines and the footer is pinned to the bottom, so the
// link chips line up across the whole page whatever the sentences above them happen to say.

import Link from "next/link";
import { FileText, Layers } from "lucide-react";
import { ActorBadge } from "@/components/av/trust-labels";
import type { Actor, AuditEvent } from "@/lib/domain/schemas";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/** The surface each producer's cards sit on. */
const SURFACE: Record<Actor["kind"], string> = {
  public: "bg-coral-tint",
  ai: "bg-violet-tint",
  system: "bg-moss-tint",
  human: "bg-leaf-tint",
};

/**
 * What an entry is about, as a chip.
 *
 * The two hues are not new: a report is the community's record and carries the reported colour, an
 * incident is what the system grouped and carries the computed one. Both sit on a white chip so they
 * stay legible on any of the four tinted surfaces behind them, including their own.
 */
const TARGET = {
  report: { label: "The report", className: "bg-card text-coral-strong", Icon: FileText },
  incident: { label: "The incident", className: "bg-card text-moss-strong", Icon: Layers },
} as const;

export function RecordCard({ event, timeZone }: { event: AuditEvent; timeZone: string }) {
  const targets: Array<{ key: keyof typeof TARGET; href: string }> = [];
  if (event.reportId) targets.push({ key: "report", href: `/reports/${event.reportId}` });
  if (event.incidentId) targets.push({ key: "incident", href: `/incidents/${event.incidentId}` });

  return (
    <article className={cn("flex h-full flex-col gap-2.5 rounded-2xl p-4", SURFACE[event.actor.kind])}>
      <header className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-foreground/60 tabular-nums">
          {formatTime(event.at, timeZone)}
        </span>
        <ActorBadge actor={event.actor.kind} name={event.actor.name} />
      </header>

      {/* Exactly two lines of room, whether the sentence needs one or two. Clipping alone still
          lets a short entry collapse, and a card whose text stops early leaves its chips floating
          at a different height from its neighbour's — the boxes match but nothing inside them
          lines up, which is what reads as untidy. */}
      <p className="line-clamp-2 min-h-12 text-sm leading-6">{event.summary}</p>

      {event.note ? (
        <p className="line-clamp-1 border-l-2 border-foreground/15 pl-3 text-xs leading-5 text-foreground/70 italic">
          {event.note}
        </p>
      ) : null}

      <footer className="mt-3 flex flex-wrap items-center gap-1.5">
        <code className="rounded-full bg-foreground/8 px-2 py-0.5 font-mono text-[10px] text-foreground/60">
          {event.action}
        </code>
        {targets.map(({ key, href }) => {
          const chip = TARGET[key];
          return (
            <Link
              key={key}
              href={href}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-transform hover:scale-[1.04]",
                chip.className,
              )}
            >
              <chip.Icon className="size-2.5" aria-hidden />
              {chip.label}
            </Link>
          );
        })}
      </footer>
    </article>
  );
}
