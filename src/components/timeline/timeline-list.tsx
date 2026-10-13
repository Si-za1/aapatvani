// The timeline, drawn.
//
// A rail down the left with the evidence strung along it, grouped under a date. Each node carries
// the colour, the icon and the word of whoever produced it, which is the same rule the rest of the
// app follows: a reader who cannot tell two of these colours apart still gets the whole meaning.
//
// The line is drawn per row rather than once behind the list, so it can start at the first node and
// stop at the last instead of running off both ends of the card.

import Link from "next/link";
import { ArrowUpRight, Bot, Calculator, MessageSquareQuote, UserCheck } from "lucide-react";
import { ActorBadge } from "@/components/av/trust-labels";
import type { Actor } from "@/lib/domain/schemas";
import type { TimelineEntry } from "@/lib/timeline/service";
import type { TimelineGroup } from "@/lib/timeline/group";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const MARK: Record<Actor["kind"], { className: string; Icon: typeof Bot }> = {
  public: { className: "bg-coral-tint text-coral-strong", Icon: MessageSquareQuote },
  ai: { className: "bg-violet-tint text-violet-strong", Icon: Bot },
  system: { className: "bg-moss-tint text-moss-strong", Icon: Calculator },
  human: { className: "bg-leaf-tint text-leaf-strong", Icon: UserCheck },
};

export function TimelineList({ groups, timeZone }: { groups: TimelineGroup[]; timeZone: string }) {
  return (
    <div className="flex flex-col gap-7">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h2 className="mb-3 text-sm font-bold tracking-tight">{group.label}</h2>
          <ol>
            {group.entries.map((entry, index) => (
              <Row
                key={entry.id}
                entry={entry}
                timeZone={timeZone}
                isFirst={index === 0}
                isLast={index === group.entries.length - 1}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Row({
  entry,
  timeZone,
  isFirst,
  isLast,
}: {
  entry: TimelineEntry;
  timeZone: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const mark = MARK[entry.actor] ?? MARK.system;
  const solo = isFirst && isLast;

  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          "relative z-10 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-card",
          mark.className,
        )}
      >
        <mark.Icon className="size-3.5" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1.5 pb-5">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-sm leading-snug font-semibold">{entry.title}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{formatTime(entry.at, timeZone)}</span>
        </span>

        {entry.detail ? <span className="text-xs text-muted-foreground">{entry.detail}</span> : null}

        {entry.quote ? (
          <span className="rounded-xl bg-sand/50 px-3 py-2 text-xs leading-relaxed text-foreground/80">
            “{entry.quote}”
          </span>
        ) : null}

        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <ActorBadge actor={entry.actor} />
          {entry.about ? <span className="font-mono text-[11px] text-muted-foreground">{entry.about}</span> : null}
          {entry.href ? (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-ink-soft">
              Open
              <ArrowUpRight className="size-3" aria-hidden />
            </span>
          ) : null}
        </span>
      </span>
    </>
  );

  const shared = "group/row relative flex gap-4 rounded-2xl pl-1 transition-colors";

  return (
    <li>
      {entry.href ? (
        <Link href={entry.href} className={cn(shared, "hover:bg-sand/50")}>
          {!solo ? <Rail isFirst={isFirst} isLast={isLast} /> : null}
          {body}
        </Link>
      ) : (
        <div className={shared}>
          {!solo ? <Rail isFirst={isFirst} isLast={isLast} /> : null}
          {body}
        </div>
      )}
    </li>
  );
}

/** The segment of the line this row owns: from the node above to the node below. */
function Rail({ isFirst, isLast }: { isFirst: boolean; isLast: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute left-[17.5px] w-px bg-stone",
        isFirst ? "top-4" : "top-0",
        isLast ? "h-4" : "bottom-0",
      )}
    />
  );
}
