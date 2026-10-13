// One thing that happened, as a card.
//
// The surface takes the colour of whoever produced it, which is the same four-way split the rest of
// the app uses, so a screen of these can be read by scanning the tint before any of the text. The
// body stays in ordinary ink: a tint is a label here, not a background for prose.
//
// The actor is never the colour alone. Every card carries the badge with its icon and its word, which
// is the rule this whole product is built on and the reason a reviewer can trust what they are
// looking at.

import Link from "next/link";
import { ActorBadge, actorTone } from "@/components/av/trust-labels";
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

export function RecordCard({ event, timeZone }: { event: AuditEvent; timeZone: string }) {
  const tone = actorTone(event.actor.kind);

  return (
    <article className={cn("flex flex-col gap-2.5 rounded-2xl p-4", SURFACE[event.actor.kind])}>
      <header className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-foreground/60 tabular-nums">
          {formatTime(event.at, timeZone)}
        </span>
        <ActorBadge actor={event.actor.kind} name={event.actor.name} />
      </header>

      <p className="text-sm leading-relaxed">{event.summary}</p>

      {event.note ? (
        <p className="border-l-2 border-foreground/15 pl-3 text-xs leading-relaxed text-foreground/70 italic">
          {event.note}
        </p>
      ) : null}

      <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-foreground/60">
        <code className="font-mono">{event.action}</code>
        {event.reportId ? (
          <Link href={`/reports/${event.reportId}`} className="font-semibold underline underline-offset-4">
            The report
          </Link>
        ) : null}
        {event.incidentId ? (
          <Link href={`/incidents/${event.incidentId}`} className="font-semibold underline underline-offset-4">
            The incident
          </Link>
        ) : null}
        <span className="sr-only">{tone.label}</span>
      </footer>
    </article>
  );
}
