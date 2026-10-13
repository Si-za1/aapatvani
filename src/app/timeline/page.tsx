import { Suspense } from "react";
import type { Metadata } from "next";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { SectionCard } from "@/components/av/cards";
import { TimelineAxes } from "@/components/timeline/timeline-axis";
import { TimelineControls } from "@/components/timeline/timeline-controls";
import { TimelineLegend } from "@/components/timeline/timeline-legend";
import { getRegion, hazardLabel } from "@/config/regions";
import { requireReviewer } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { groupEntries, type Granularity } from "@/lib/timeline/group";
import { timelineData } from "@/lib/timeline/service";

// The timeline.
//
// Every other screen in this app answers a question about one thing: this report, this incident, this
// claim. The timeline answers "how do we know any of this, and in what order did we come to know
// it?" It adds no facts of its own, it only puts the records that are already in the store on a line,
// which is why the chain from a community report to an approved alert can be read in one pass.
//
// The axis is when evidence entered the record, not when the event happened. That is the only thing
// the system actually knows, and the reporter's own words about when it happened sit beside it.

export const metadata: Metadata = { title: "Timeline" };

export default function TimelinePage({ searchParams }: PageProps<"/timeline">) {
  return (
    <Suspense fallback={<div className="h-[36rem] animate-pulse rounded-3xl bg-sand/60" aria-hidden />}>
      <Screen searchParams={searchParams} />
    </Suspense>
  );
}

async function Screen({ searchParams }: { searchParams: PageProps<"/timeline">["searchParams"] }) {
  const reviewer = await requireReviewer("/timeline");
  const params = await searchParams;
  const env = getEnv();
  const region = getRegion(env.defaultRegionId);

  const category = typeof params.category === "string" ? params.category : undefined;
  const requested = typeof params.group === "string" ? params.group : undefined;
  const granularity: Granularity = requested === "week" || requested === "month" ? requested : "day";

  const data = await timelineData(category);
  const groups = groupEntries(data.entries, granularity, data.generatedAt, region.timezone);

  const description = category
    ? `Every piece of evidence for ${hazardLabel(region, category).toLowerCase()}, with who produced it.`
    : "Every piece of evidence, with who produced it.";

  return (
    <AppShell current="/timeline" reviewer={reviewer}>
      <PageHeader title="Timeline" description={description}>
        <TimelineControls
          categories={data.categories}
          regionId={region.id}
          granularity={granularity}
          category={category}
        />
      </PageHeader>

      <div className="flex flex-col gap-5">
        <SectionCard
          title={category ? hazardLabel(region, category) : "All evidence"}
          note={`${data.entries.length} entr${data.entries.length === 1 ? "y" : "ies"}`}
        >
          {/* The key to the whole drawing, said once and plainly, so nobody has to work out what the
              two halves mean by comparing them. */}
          <p className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full bg-coral" />
              Above the line, what communities reported.
            </span>
            <span aria-hidden className="text-border">
              |
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-1.5 rounded-full bg-ink" />
              Below it, what the system and reviewers did about it.
            </span>
          </p>

          {data.entries.length === 0 ? (
            <p className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
              <span className="text-sm font-medium">Nothing recorded for this yet</span>
              <span className="max-w-md text-sm text-muted-foreground">
                A report arriving, the model reading it, a reviewer deciding on a claim and the road analysis all
                appear here as they happen.
              </span>
            </p>
          ) : (
            <TimelineAxes groups={groups} regionId={region.id} />
          )}

          <p className="mt-6 border-t border-border/70 pt-4 text-xs leading-relaxed text-muted-foreground">
            Times are when a piece of evidence entered the record, in {region.name} time ({region.utcOffset}), and
            spacing along the line is time, with a floor so that two events a minute apart never sit on top of each
            other. When an event happened is only ever what the reporter said, and it is shown as their words rather
            than as a time this app worked out.
          </p>
        </SectionCard>

        <TimelineLegend entries={data.entries} />
      </div>
    </AppShell>
  );
}
