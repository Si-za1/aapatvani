// What is happening, why we think so, and where.
//
// The incident page opens on a strip of four facts, and four facts are not an overview. This is the
// page you read before deciding anything: what was reported and by how many independent witnesses,
// what the claims actually say, what disagrees, what the road analysis found, and — the part every
// other screen leaves you to assemble yourself — what still needs a person.
//
// It is built entirely from records that already exist. Nothing here is a new fact; it is the same
// record, read in the order a responder reads it.

import Link from "next/link";
import {
  ArrowUpRight,
  Calculator,
  CircleCheck,
  Clock,
  GitCompareArrows,
  Inbox,
  Layers,
  MapPin,
  TriangleAlert,
} from "lucide-react";
import { SectionCard } from "@/components/av/cards";
import { HazardGlyph } from "@/components/av/hazard-icon";
import { ReviewBadge } from "@/components/av/trust-labels";
import { getRegion, hazardIcon, hazardLabel } from "@/config/regions";
import type { Claim, ImpactAssessment, Incident, IncidentStatus, Report } from "@/lib/domain/schemas";
import { describeLocation, incidentLocationView } from "@/lib/location-view";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface OverviewProps {
  incident: Incident;
  reports: Report[];
  /** Report ids this incident treats as copies of another member, from the membership record. */
  copyOf: Record<string, string | undefined>;
  claims: Claim[];
  assessment: ImpactAssessment | null;
  openContradictions: number;
  settledContradictions: number;
  regionId: string;
  now: string;
}

const STATUS: Record<IncidentStatus, { label: string; note: string; className: string }> = {
  candidate: {
    label: "Needs a reviewer",
    note: "The grouping is the system's proposal. Until a person accepts it, this is a candidate, not an event.",
    className: "bg-amber-tint text-amber-strong",
  },
  under_review: {
    label: "Under review",
    note: "A reviewer has started on this incident and has not settled it.",
    className: "bg-violet-tint text-violet-strong",
  },
  verified: {
    label: "Verified",
    note: "A named reviewer has confirmed this incident and its grouping.",
    className: "bg-leaf-tint text-leaf-strong",
  },
  dismissed: {
    label: "Dismissed",
    note: "A reviewer decided these reports do not describe one event.",
    className: "bg-stone-tint text-stone-strong",
  },
};

export function IncidentOverview(props: OverviewProps) {
  const { incident, reports, claims, assessment, regionId, now, copyOf } = props;
  // Where the incident is, in the four states a reviewer has to tell apart (§lib/location-view).
  const where = incidentLocationView(incident, reports);
  const whereText = describeLocation(where);
  const region = getRegion(regionId);
  const status = STATUS[incident.status];
  const at = Date.parse(now);

  const unchecked = claims.filter((claim) => claim.review.status === "unreviewed");
  const roadClaims = claims.filter((claim) => claim.roadStatus);
  const lostAccess = assessment?.candidates.filter((candidate) => candidate.finding === "lost_access") ?? [];
  const longerRoute = assessment?.candidates.filter((candidate) => candidate.finding === "longer_route") ?? [];

  /** What still needs a person, in the order it should be done. */
  const todo: Array<{ key: string; label: string; href: string; Icon: typeof Clock; attention: boolean }> = [];
  if (incident.status === "candidate" || incident.status === "under_review") {
    todo.push({
      key: "grouping",
      label:
        incident.independentSources > 1
          ? `Settle the grouping: ${incident.independentSources} independent witnesses say the same thing`
          : "Settle the grouping: one source so far, and a reviewer decides whether it stands alone",
      href: "?tab=grouping",
      Icon: Layers,
      attention: true,
    });
  }
  if (unchecked.length > 0) {
    todo.push({
      key: "claims",
      label: `Check ${unchecked.length} claim${unchecked.length === 1 ? "" : "s"} a person has not read`,
      href: "?tab=evidence",
      Icon: Inbox,
      attention: true,
    });
  }
  if (props.openContradictions > 0) {
    todo.push({
      key: "contradictions",
      label: `Resolve ${props.openContradictions} report${props.openContradictions === 1 ? "" : "s"} that disagree`,
      href: "?tab=grouping",
      Icon: GitCompareArrows,
      attention: true,
    });
  }
  if (!assessment) {
    todo.push({
      key: "impact",
      label: "Run the road analysis, to see what loses access to care",
      href: "?tab=impact",
      Icon: Calculator,
      attention: true,
    });
  } else {
    const waiting = assessment.candidates.filter((candidate) => candidate.review.status === "unreviewed").length;
    if (waiting > 0) {
      todo.push({
        key: "findings",
        label: `Decide on ${waiting} road-analysis finding${waiting === 1 ? "" : "s"}`,
        href: "?tab=impact",
        Icon: Calculator,
        attention: true,
      });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Three columns answering the three questions, in the order they get asked. */}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <SectionCard title="What is reported">
          <div className="flex flex-col gap-3">
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                status.className,
              )}
            >
              {status.label}
            </span>
            <p className="text-xs leading-relaxed text-muted-foreground">{status.note}</p>

            <dl className="flex flex-col divide-y divide-border/70 text-sm">
              <Fact label="Hazard">
                <span className="inline-flex items-center gap-1.5">
                  <HazardGlyph icon={hazardIcon(region, incident.hazard.category)} className="size-3.5 text-ink-soft" />
                  {hazardLabel(region, incident.hazard.category)}
                  <span className="text-xs text-muted-foreground">· from the {incident.hazard.source}</span>
                </span>
              </Fact>
              <Fact label="Where">
                <span className="inline-flex items-start gap-1.5">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex flex-col gap-0.5">
                    <span className={cn(where.kind === "named" && "font-medium")}>{whereText.headline}</span>
                    <span className="text-xs text-muted-foreground">{whereText.qualifier}</span>
                  </span>
                </span>
              </Fact>
              <Fact label="First reported">{relativeTime(incident.firstReportedAt, at)}</Fact>
              <Fact label="Latest report">{relativeTime(incident.lastReportedAt, at)}</Fact>
            </dl>
          </div>
        </SectionCard>

        <SectionCard title="Why we think so">
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <span className="text-[32px] leading-none font-bold tracking-tight tabular-nums">
                {incident.independentSources}
              </span>
              <span className="text-sm font-semibold">
                independent source{incident.independentSources === 1 ? "" : "s"}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {reports.length} report{reports.length === 1 ? "" : "s"} reached us
              {reports.length > incident.independentSources
                ? `, and ${reports.length - incident.independentSources} of them copied another. A copy is linked to the report it copies and never counted as a second witness.`
                : ", and none of them is a copy of another."}
            </p>

            <ul className="flex flex-col divide-y divide-border/70">
              {reports.map((report) => (
                <li key={report.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/reports/${report.id}`} className="font-mono text-xs hover:underline">
                    {report.referenceCode}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {copyOf[report.id] ? "a copy" : "a witness"}
                    <span>{relativeTime(report.submittedAt, at)}</span>
                  </span>
                </li>
              ))}
            </ul>

            {roadClaims.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {roadClaims.length} claim{roadClaims.length === 1 ? "" : "s"} describe a road state:{" "}
                {roadClaims
                  .map((claim) => (claim.roadStatus === "blocked" ? "blocked" : claim.roadStatus ?? "unclear"))
                  .filter((value, index, all) => all.indexOf(value) === index)
                  .join(", ")}
                .
              </p>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="What disagrees">
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <span className="text-[32px] leading-none font-bold tracking-tight tabular-nums">
                {props.openContradictions}
              </span>
              <span className="text-sm font-semibold">still open</span>
            </div>
            {props.openContradictions === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Nothing in these reports contradicts anything else.
                {props.settledContradictions > 0
                  ? ` ${props.settledContradictions} earlier flag${props.settledContradictions === 1 ? " was" : "s were"} resolved by a reviewer.`
                  : ""}
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Two reports can describe the same event and still disagree about it. Nothing is treated as settled
                while a disagreement is open — the grouping tab lists each one with the reports it came from.
              </p>
            )}
            {claims.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {claims.length} claim{claims.length === 1 ? "" : "s"} in total, {unchecked.length} of them not yet read
                by a person.
              </p>
            ) : null}
          </div>
        </SectionCard>
      </div>

      {/* The road analysis, in the words a responder would use: how many places, and how much worse. */}
      <SectionCard
        title="What the roads say"
        note={assessment ? `version ${assessment.version}, run ${relativeTime(assessment.createdAt, at)}` : undefined}
        action={
          <Link href="?tab=impact" className="group inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            Open the analysis
            <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
          </Link>
        }
      >
        {!assessment ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
            The road analysis has not been run. It is a calculation over the OpenStreetMap extract, not a prediction:
            it asks which settlements would keep a mapped route to a health facility if the road a report describes
            as blocked really were blocked.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm">{assessment.statusMessage}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                tone="bg-flame-tint text-flame-strong"
                value={lostAccess.length}
                label="places lose every mapped route to care"
              />
              <Stat
                tone="bg-amber-tint text-amber-strong"
                value={longerRoute.length}
                label="places keep a route, but a much longer one"
              />
              <Stat
                tone="bg-moss-tint text-moss-strong"
                value={assessment.candidates.filter((c) => c.kind === "nearby_asset").length}
                label="things nearby, not assumed affected"
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {assessment.stats.facilitiesAffected ?? 0} health facilit
              {(assessment.stats.facilitiesAffected ?? 0) === 1 ? "y has" : "ies have"} a changed catchment. Places
              outside this analysis are not necessarily safe; they have not been checked.
            </p>
          </div>
        )}
      </SectionCard>

      {/* The part every other screen makes you assemble: what to do next. */}
      <SectionCard title="What needs a person" note={todo.length === 0 ? "Nothing" : `${todo.length} thing${todo.length === 1 ? "" : "s"}`}>
        {todo.length === 0 ? (
          <p className="flex items-start gap-2.5 rounded-2xl bg-leaf-tint px-4 py-3.5 text-sm text-leaf-strong">
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Every claim has been read, the grouping is settled and the analysis has been decided on. Nothing on this
              incident is waiting for anyone.
            </span>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {todo.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="group flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 transition-colors hover:bg-sand/60"
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-xl",
                      item.attention ? "bg-amber-tint text-amber-strong" : "bg-leaf-tint text-leaf-strong",
                    )}
                  >
                    <item.Icon className="size-4" aria-hidden />
                  </span>
                  <span className="text-sm">{item.label}</span>
                  <ArrowUpRight className="ml-auto size-4 shrink-0 text-border transition-colors group-hover:text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {incident.verification ? (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <ReviewBadge status="confirmed" by={incident.verification.byName} />
            <span>{relativeTime(incident.verification.at, at)}</span>
          </p>
        ) : (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <TriangleAlert className="size-3.5 text-amber" aria-hidden />
            No reviewer has confirmed this incident. Nothing on this deployment says Confirmed until one does.
          </p>
        )}
      </SectionCard>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

function Stat({ tone, value, label }: { tone: string; value: number; label: string }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-2xl px-4 py-3.5", tone)}>
      <span className="text-[26px] leading-none font-bold tracking-tight tabular-nums">{value}</span>
      <span className="text-xs font-medium opacity-80">{label}</span>
    </div>
  );
}
