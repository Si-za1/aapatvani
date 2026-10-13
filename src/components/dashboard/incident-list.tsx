// The incident list on the overview.
//
// A row per incident: what it is, what state it is in, and how much of it rests on more than one
// witness. The status is the only coloured thing, because it is the only thing a reviewer acts on.
// Everything else is words.

import Link from "next/link";
import { HazardGlyph } from "@/components/av/hazard-icon";
import { getRegion, hazardIcon, hazardLabel } from "@/config/regions";
import type { Incident, IncidentStatus } from "@/lib/domain/schemas";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const TONE: Record<IncidentStatus, { label: string; className: string; dot: string }> = {
  candidate: { label: "Needs review", className: "bg-amber-tint text-amber-strong", dot: "bg-amber" },
  under_review: { label: "Under review", className: "bg-violet-tint text-violet-strong", dot: "bg-violet" },
  verified: { label: "Verified", className: "bg-leaf-tint text-leaf-strong", dot: "bg-leaf" },
  dismissed: { label: "Dismissed", className: "bg-stone-tint text-stone-strong", dot: "bg-stone" },
};

export function IncidentList({ incidents, regionId }: { incidents: Incident[]; regionId: string }) {
  const region = getRegion(regionId);

  return (
    <ul className="flex flex-col gap-1">
      {incidents.map((incident) => {
        const tone = TONE[incident.status];
        return (
          <li key={incident.id}>
            <Link
              href={`/incidents/${incident.id}`}
              className="flex items-start gap-3 rounded-2xl p-2.5 transition-colors hover:bg-sand/60"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sand text-ink-soft">
                <HazardGlyph icon={hazardIcon(region, incident.hazard.category)} className="size-[18px]" />
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-start justify-between gap-3">
                  <span className="text-sm leading-snug font-semibold">{incident.title}</span>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      tone.className,
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
                    {tone.label}
                  </span>
                </span>

                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                  <span>{hazardLabel(region, incident.hazard.category)}</span>
                  <span aria-hidden>·</span>
                  <span>{incident.independentSources} independent</span>
                  {incident.openContradictions > 0 ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-semibold text-flame-strong">
                        {incident.openContradictions} contradiction
                        {incident.openContradictions === 1 ? "" : "s"}
                      </span>
                    </>
                  ) : null}
                  <span className="ml-auto">{relativeTime(incident.lastReportedAt)}</span>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
