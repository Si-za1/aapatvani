// How to read the rail.
//
// Every node on the timeline carries a colour, an icon and a word, and the word is on the node
// itself. This card is here because the colour is the fastest thing to read and the slowest thing to
// trust, so the four producers are spelled out once, with what each of them actually means and how
// much of this view each accounts for.

import { ACTOR_TONE } from "@/components/av/trust-labels";
import { SectionCard } from "@/components/av/cards";
import type { Actor } from "@/lib/domain/schemas";
import type { TimelineEntry } from "@/lib/timeline/service";
import { cn } from "@/lib/utils";

const MEANING: Record<Actor["kind"], { blurb: string }> = {
  public: { blurb: "What a member of the community sent in, in their own words." },
  ai: { blurb: "What Gemini read from a report. Labelled as an interpretation, never as fact." },
  system: { blurb: "What deterministic code worked out over the road network, map data or grouping rules." },
  human: { blurb: "What a named reviewer decided. This is the only source of the word Confirmed." },
};

const ORDER: Actor["kind"][] = ["public", "ai", "system", "human"];

export function TimelineLegend({ entries }: { entries: TimelineEntry[] }) {
  const counts = new Map<Actor["kind"], number>();
  for (const entry of entries) counts.set(entry.actor, (counts.get(entry.actor) ?? 0) + 1);

  return (
    <SectionCard title="Who produced what" note="In this view">
      <ul className="flex flex-col gap-3.5">
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
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {count} {count === 1 ? "entry" : "entries"}
                  </span>
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">{MEANING[kind].blurb}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 border-t border-border/70 pt-4 text-xs leading-relaxed text-muted-foreground">
        Nothing here is rewritten to make the story tidier. A claim a reviewer rejected stays on the rail as a
        rejection, and a correction shows the correction.
      </p>
    </SectionCard>
  );
}
