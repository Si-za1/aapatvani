// How to read the line.
//
// Every node carries a colour, an icon and a word, and the word is on the node itself. This strip is
// here because the colour is the fastest thing to read and the slowest thing to trust, so the four
// producers are spelled out once, with what each actually means and how much of this view it
// accounts for. It runs along the bottom rather than down a side column, because the line wants the
// whole width.

import { ACTOR_TONE } from "@/components/av/trust-labels";
import { SectionCard } from "@/components/av/cards";
import type { Actor } from "@/lib/domain/schemas";
import type { TimelineEntry } from "@/lib/timeline/types";
import { cn } from "@/lib/utils";

const MEANING: Record<Actor["kind"], string> = {
  public: "What a member of the community sent in, in their own words. These are the pills above the line.",
  ai: "What Gemini read from a report. Labelled as an interpretation, never as fact.",
  system: "What deterministic code worked out over the road network, the map data or the grouping rules.",
  human: "What a named reviewer decided. The only source of the word Confirmed.",
};

const ORDER: Actor["kind"][] = ["public", "ai", "system", "human"];

export function TimelineLegend({ entries }: { entries: TimelineEntry[] }) {
  const counts = new Map<Actor["kind"], number>();
  for (const entry of entries) counts.set(entry.actor, (counts.get(entry.actor) ?? 0) + 1);

  return (
    <SectionCard title="Who produced what" note="In this view">
      <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
        {ORDER.map((kind) => {
          const tone = ACTOR_TONE[kind];
          const count = counts.get(kind) ?? 0;
          return (
            <li key={kind} className={cn("flex gap-3", count === 0 && "opacity-55")}>
              <span
                aria-hidden
                className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", tone.className)}
              >
                <tone.Icon className="size-3.5" />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{tone.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">{MEANING[kind]}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
