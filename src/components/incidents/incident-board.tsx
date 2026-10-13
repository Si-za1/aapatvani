// The incident board.
//
// Grouped by hazard, because that is the question a reviewer actually asks: "what landslides do we
// have?" Each group is a tinted panel with its incidents as cards inside it, which makes the shape of
// a shift readable before any of the text is: a big amber panel means a lot of unsettled work.
//
// The tint is not decoration. A panel takes the colour of the most attention-needing incident in it,
// using the same four colours as the status pills inside, so the loudest panel on the page is always
// the one that most needs a person. The header says which, in words, because colour alone never
// carries meaning here.

import Link from "next/link";
import { Calculator, CircleCheck, GitCompareArrows, MapPin, TriangleAlert } from "lucide-react";
import { HazardGlyph } from "@/components/av/hazard-icon";
import { getRegion, hazardIcon, hazardLabel } from "@/config/regions";
import type { Incident, IncidentStatus } from "@/lib/domain/schemas";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const STATUS: Record<IncidentStatus, { label: string; className: string; dot: string }> = {
  candidate: { label: "Needs review", className: "bg-amber-tint text-amber-strong", dot: "bg-amber" },
  under_review: { label: "Under review", className: "bg-violet-tint text-violet-strong", dot: "bg-violet" },
  verified: { label: "Verified", className: "bg-leaf-tint text-leaf-strong", dot: "bg-leaf" },
  dismissed: { label: "Dismissed", className: "bg-stone-tint text-stone-strong", dot: "bg-stone" },
};

/** The panel takes the colour of the most attention-needing incident in it. */
const URGENCY: IncidentStatus[] = ["candidate", "under_review", "verified", "dismissed"];

const PANEL: Record<IncidentStatus, string> = {
  candidate: "bg-amber-tint",
  under_review: "bg-violet-tint",
  verified: "bg-leaf-tint",
  dismissed: "bg-stone-tint",
};

const PANEL_NOTE: Record<IncidentStatus, (n: number) => string> = {
  candidate: (n) => `${n} need${n === 1 ? "s" : ""} a reviewer`,
  under_review: (n) => `${n} under review`,
  verified: (n) => `${n} verified`,
  dismissed: (n) => `${n} dismissed`,
};

export interface BoardGroup {
  hazard: string;
  incidents: Incident[];
}

export function IncidentBoard({
  groups,
  reportCounts,
  regionId,
}: {
  groups: BoardGroup[];
  reportCounts: Map<string, number>;
  regionId: string;
}) {
  const region = getRegion(regionId);

  return (
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => {
        const urgency = URGENCY.find((status) => group.incidents.some((i) => i.status === status)) ?? "dismissed";
        const needing = group.incidents.filter((i) => i.status === urgency).length;
        return (
          <section key={group.hazard} className={cn("rounded-3xl p-2", PANEL[urgency])}>
            <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 pt-2 pb-3">
              <h2 className="flex items-center gap-2.5 text-base font-bold tracking-tight">
                <span className="grid size-8 place-items-center rounded-xl bg-card/70 text-ink-soft">
                  <HazardGlyph icon={hazardIcon(region, group.hazard)} className="size-4" />
                </span>
                {hazardLabel(region, group.hazard)}
              </h2>
              <p className="text-xs font-medium opacity-70">
                {group.incidents.length} incident{group.incidents.length === 1 ? "" : "s"} ·{" "}
                {PANEL_NOTE[urgency](needing)}
              </p>
            </header>

            <ul className="flex flex-col gap-2">
              {group.incidents.map((incident) => (
                <li key={incident.id}>
                  <IncidentCard incident={incident} reportCount={reportCounts.get(incident.id) ?? 0} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * One incident. The status is the loudest thing on it, then what it rests on, then what has been
 * done about it: a blast radius that has been run and an alert that has been drafted are both facts
 * about progress, and until now they were only visible two thousand pixels down a detail page.
 */
export function IncidentCard({ incident, reportCount }: { incident: Incident; reportCount: number }) {
  const tone = STATUS[incident.status];

  return (
    <Link
      href={`/incidents/${incident.id}`}
      className="flex flex-col gap-3 rounded-2xl bg-card p-4 transition-shadow hover:shadow-[0_10px_30px_-14px_rgba(28,31,24,0.22)]"
    >
      <span className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            tone.className,
          )}
        >
          <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
          {tone.label}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(incident.lastReportedAt)}</span>
      </span>

      <span className="flex flex-col gap-1">
        <span className="text-sm leading-snug font-semibold">{incident.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>
            {reportCount} report{reportCount === 1 ? "" : "s"}
          </span>
          <span aria-hidden>·</span>
          <span>{incident.independentSources} independent</span>
          {incident.location ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden />
                placed
              </span>
            </>
          ) : null}
        </span>
      </span>

      <span className="flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-3">
        {incident.openContradictions > 0 ? (
          <Flag tone="bg-flame-tint text-flame-strong" Icon={GitCompareArrows}>
            {incident.openContradictions} contradiction{incident.openContradictions === 1 ? "" : "s"}
          </Flag>
        ) : null}
        {/* Always shown, in one state or the other. The road analysis is the part of this product
            nobody finds by accident, and a chip that only appears once you have run it is a chip
            that never tells you it is there. */}
        <Flag
          tone={incident.latestImpactId ? "bg-moss-tint text-moss-strong" : "bg-stone-tint text-stone-strong"}
          Icon={Calculator}
        >
          {incident.latestImpactId ? "Blast radius run" : "Blast radius not run"}
        </Flag>
        {incident.latestAlertId ? (
          <Flag tone="bg-violet-tint text-violet-strong" Icon={TriangleAlert}>
            Alert drafted
          </Flag>
        ) : null}
      </span>

      {incident.verification ? (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-leaf-strong">
          <CircleCheck className="size-3.5" aria-hidden />
          Verified by {incident.verification.byName}
        </span>
      ) : null}
    </Link>
  );
}

function Flag({
  tone,
  Icon,
  children,
}: {
  tone: string;
  Icon: typeof MapPin;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", tone)}>
      <Icon className="size-3" aria-hidden />
      {children}
    </span>
  );
}

/** The flat view, for when a reviewer wants to scan one list rather than a wall of panels. */
export function IncidentRows({
  incidents,
  reportCounts,
  regionId,
}: {
  incidents: Incident[];
  reportCounts: Map<string, number>;
  regionId: string;
}) {
  const region = getRegion(regionId);

  return (
    <ul className="flex flex-col gap-2">
      {incidents.map((incident) => {
        const tone = STATUS[incident.status];
        const count = reportCounts.get(incident.id) ?? incident.reportIds.length;
        return (
          <li key={incident.id}>
            <Link
              href={`/incidents/${incident.id}`}
              className="grid gap-x-6 gap-y-2 rounded-2xl bg-card px-5 py-4 transition-shadow hover:shadow-[0_4px_20px_rgba(28,31,24,0.08)] lg:grid-cols-[1fr_11rem_10rem_5rem] lg:items-center"
            >
              <span className="flex flex-col gap-1">
                <span className="text-sm leading-snug font-semibold">{incident.title}</span>
                {incident.verification ? (
                  <span className="text-xs text-leaf-strong">
                    Verified by {incident.verification.byName} · {relativeTime(incident.verification.at)}
                  </span>
                ) : null}
              </span>

              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground lg:flex-col lg:items-start lg:gap-0.5">
                <span className="font-medium text-foreground">{hazardLabel(region, incident.hazard.category)}</span>
                <span>
                  {count} report{count === 1 ? "" : "s"} · {incident.independentSources} independent
                </span>
                {incident.openContradictions > 0 ? (
                  <span className="font-medium text-flame-strong">
                    {incident.openContradictions} contradiction{incident.openContradictions === 1 ? "" : "s"}
                  </span>
                ) : null}
              </span>

              <span className={cn("inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium", tone.className)}>
                {tone.label}
              </span>

              <span className="text-xs text-muted-foreground lg:text-right">{relativeTime(incident.lastReportedAt)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
