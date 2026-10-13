// One stretch of the timeline, drawn as a line with evidence hung off it.
//
// The split is the whole idea: **above the line is what a community reported, below it is what the
// system and reviewers did about it.** A reader can see at a glance where the human voices are and
// where the machine and the reviewer took over, which is the difference this product is selling.
//
// Nothing here is a chart. The line carries no scale and no ticks, because the spacing already says
// what matters, which is order and rough distance in time; pretending to a measured axis would invite
// reading precision that the data does not have.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HazardGlyph } from "@/components/av/hazard-icon";
import { ActorBadge } from "@/components/av/trust-labels";
import { getRegion, hazardIcon } from "@/config/regions";
import { ABOVE_LANE, LEAD, SLOT, TIME_LANE, layoutAxis } from "@/lib/timeline/layout";
import type { TimelineGroup } from "@/lib/timeline/group";
import type { TimelineEntry } from "@/lib/timeline/types";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export function TimelineAxes({ groups, regionId }: { groups: TimelineGroup<TimelineEntry>[]; regionId: string }) {
  return (
    <div className="flex flex-col gap-9">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <header className="mb-1 flex items-baseline gap-3">
            <h2 className="text-sm font-bold tracking-tight">{group.label}</h2>
            <span className="text-xs text-muted-foreground">
              {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
            </span>
          </header>
          <TimelineAxis entries={group.entries} regionId={regionId} />
        </section>
      ))}
    </div>
  );
}

function TimelineAxis({ entries, regionId }: { entries: TimelineEntry[]; regionId: string }) {
  const region = getRegion(regionId);
  const layout = layoutAxis(entries);
  // A stretch where nothing was reported by the community does not need a lane above the line. It
  // collapses to just the time labels, which is the difference between a quiet day reading as quiet
  // and reading as a wall of empty space.
  const aboveLane = layout.markers.some((marker) => marker.above) ? ABOVE_LANE : TIME_LANE;

  return (
    // The line is as wide as its moments need, which on a busy day is wider than the card. Rather
    // than quietly cramming the last report off the edge, it scrolls, and the soft edge says so.
    <div className="relative">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="relative flex" style={{ width: layout.width, minWidth: layout.width }}>
          {/* The line itself. It runs the width of the drawing and ends in an arrow, because a
              timeline that stops dead reads like it stopped happening. */}
          <div aria-hidden className="absolute right-0 left-0 flex items-center" style={{ top: aboveLane }}>
            <span className="h-px flex-1 bg-stone" />
            <ArrowRight className="size-3.5 shrink-0 -translate-y-px text-stone" />
          </div>

          {layout.markers.map((marker, index) => (
            <Marker
              key={marker.key}
              marker={marker}
              aboveLane={aboveLane}
              regionId={regionId}
              timeZone={region.timezone}
              gap={index === 0 ? marker.x - LEAD : marker.x - layout.markers[index - 1].x - SLOT}
            />
          ))}
        </div>
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent"
      />
    </div>
  );
}

function Marker({
  marker,
  aboveLane,
  regionId,
  timeZone,
  gap,
}: {
  marker: ReturnType<typeof layoutAxis>["markers"][number];
  aboveLane: number;
  regionId: string;
  timeZone: string;
  gap: number;
}) {
  return (
    <div className="group/marker relative shrink-0" style={{ width: SLOT, marginLeft: gap }}>
      {/* The thread that ties everything at this moment to the line. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 w-px border-l border-dashed border-stone",
          marker.above ? "top-1.5" : "top-0",
          "bottom-0",
        )}
      />

      {/* Above: the community's own words, if any arrived at this moment, and the time either way.
          The lane is bottom aligned, so every time label sits in one row just above the line
          whatever is stacked above it. */}
      <div className="relative flex flex-col justify-end" style={{ height: aboveLane }}>
        {marker.above ? <AbovePill entry={marker.above} regionId={regionId} /> : null}
        <p className="pl-4 pb-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">
          {formatTime(marker.at, timeZone)}
        </p>
      </div>

      {/* The node on the line, where this moment meets the axis. */}
      <span
        aria-hidden
        className="absolute -left-[3px] size-1.5 rounded-full bg-ink"
        style={{ top: aboveLane - 3 }}
      />

      {/* Below: what the system and reviewers did about it. */}
      <div className="relative flex flex-col gap-2 pt-3">
        {marker.below.map((entry) => (
          <BelowCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

/**
 * A report from the community, as a pill above the line. The pill carries the reference code rather
 * than a sentence, because the code is what a reviewer writes down and what the reporter was handed;
 * the reporter's own words are the tooltip, and the first thing on the page behind it.
 *
 * The coral dot sits at the top of the thread, which is where this particular strand of evidence
 * starts, and it is the only thing on the drawing that is filled with the reported colour.
 */
function AbovePill({ entry, regionId }: { entry: TimelineEntry; regionId: string }) {
  const region = getRegion(regionId);
  const pill = (
    <span className="flex w-fit max-w-full items-center gap-2 rounded-full bg-coral-tint py-1.5 pr-3.5 pl-2.5 text-xs font-semibold text-coral-strong transition-transform group-hover/marker:scale-[1.03]">
      <HazardGlyph icon={hazardIcon(region, entry.hazard)} className="size-3.5 shrink-0" />
      <span className="truncate font-mono text-[11px]">{entry.about}</span>
    </span>
  );

  return (
    <div className="flex flex-col items-start">
      <span aria-hidden className="-ml-[5px] mb-1.5 size-2.5 rounded-full bg-coral ring-4 ring-card" />
      {entry.href ? (
        <Link href={entry.href} title={entry.quote} className="w-fit max-w-full">
          {pill}
        </Link>
      ) : (
        pill
      )}
    </div>
  );
}

/**
 * One thing that was done about the moment above it. The producer's badge comes first and on its own
 * line, because it is the claim this app makes about everything else on the card: this is what kind
 * of statement you are reading. The title and the detail follow, clipped rather than wrapped to a
 * paragraph, since the full record is one click away and this drawing is for scanning.
 */
function BelowCard({ entry }: { entry: TimelineEntry }) {
  const inner = (
    <>
      <ActorBadge actor={entry.actor} className="w-fit" />
      <span className="mt-2 line-clamp-3 text-xs leading-snug font-semibold">{entry.title}</span>
      {entry.detail ? (
        <span className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{entry.detail}</span>
      ) : null}
      {entry.quote ? (
        <span className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          “{entry.quote}”
        </span>
      ) : null}
    </>
  );

  const shared = "flex w-full flex-col rounded-2xl border border-transparent p-2.5 transition-colors";

  return entry.href ? (
    <Link href={entry.href} className={cn(shared, "hover:border-border hover:bg-sand/50")}>
      {inner}
    </Link>
  ) : (
    <div className={shared}>{inner}</div>
  );
}
