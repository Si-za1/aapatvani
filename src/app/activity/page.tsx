import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { SectionCard } from "@/components/av/cards";
import { ACTOR_TONE } from "@/components/av/trust-labels";
import { RecordCard } from "@/components/activity/record-card";
import { StackedBar, type Slice } from "@/components/charts/stacked-bar";
import { getRegion } from "@/config/regions";
import { requireReviewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { Actor } from "@/lib/domain/schemas";
import { getEnv } from "@/lib/env";
import { groupEntries } from "@/lib/timeline/group";
import { cn } from "@/lib/utils";

// The audit trail (feature M5). Append-only: nothing here is ever edited or deleted, so the page can
// answer "who decided this, and when?" long after the decision.
//
// Laid out as a record rather than a log. Grouped by day, with each entry on a surface tinted by
// whoever produced it, so the shape of a week is legible before any of the sentences are. Down the
// side, what the record is made of and what it is for, because the point of this page is not that
// events exist but that a person's decisions and a model's output are never the same kind of thing.

export const metadata: Metadata = { title: "Activity" };

const FILTERS = [
  { key: "all", label: "Everything" },
  { key: "human", label: "People" },
  { key: "ai", label: "AI" },
  { key: "system", label: "System" },
  { key: "public", label: "Reporters" },
] as const;

/** The chart tokens in their fixed order: reported, AI, computed, reviewer. */
const CHART: Record<Actor["kind"], string> = {
  public: "var(--chart-1)",
  ai: "var(--chart-2)",
  system: "var(--chart-3)",
  human: "var(--chart-4)",
};

const ACTOR_ORDER: Actor["kind"][] = ["public", "ai", "system", "human"];

const HINT: Record<Actor["kind"], string> = {
  public: "Submitted by a member of the community.",
  ai: "Read or written by Gemini.",
  system: "Done by this app's own rules.",
  human: "Decided by a named reviewer.",
};

export default function ActivityPage({ searchParams }: PageProps<"/activity">) {
  return (
    <Suspense fallback={<div className="h-[36rem] animate-pulse rounded-3xl bg-sand/60" aria-hidden />}>
      <Screen searchParams={searchParams} />
    </Suspense>
  );
}

async function Screen({ searchParams }: { searchParams: PageProps<"/activity">["searchParams"] }) {
  const reviewer = await requireReviewer("/activity");
  const params = await searchParams;
  const actor = (FILTERS.find((f) => f.key === params.actor)?.key ?? "all") as (typeof FILTERS)[number]["key"];
  const env = getEnv();
  const region = getRegion(env.defaultRegionId);

  const db = getDb();
  const all = await db.events.list({ orderBy: { field: "at", direction: "desc" } });
  const events = actor === "all" ? all : all.filter((event) => event.actor.kind === actor);

  const counts = Object.fromEntries(
    ACTOR_ORDER.map((kind) => [kind, all.filter((event) => event.actor.kind === kind).length]),
  ) as Record<Actor["kind"], number>;

  // The chart always describes the whole record, never the filtered view: a filter that repainted
  // the totals would make "how much of this is a machine's work" unanswerable.
  const slices: Slice[] = ACTOR_ORDER.map((kind) => ({
    key: kind,
    label: ACTOR_TONE[kind].label,
    value: counts[kind],
    hint: HINT[kind],
    color: CHART[kind],
  }));

  const now = new Date().toISOString();
  const groups = groupEntries(events, "day", now, region.timezone);
  return (
    <AppShell current="/activity" reviewer={reviewer}>
      <PageHeader
        title="Activity"
        description="Every action that changed something, in order, with who or what caused it. Nothing is ever edited or removed."
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((option) => {
            const active = option.key === actor;
            const count = option.key === "all" ? all.length : counts[option.key as Actor["kind"]];
            return (
              <Link
                key={option.key}
                href={option.key === "all" ? "/activity" : `/activity?actor=${option.key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-accent",
                )}
              >
                {option.label}
                <span className="tabular-nums opacity-70">{count}</span>
              </Link>
            );
          })}
        </div>
      </PageHeader>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <SectionCard
          title="The record"
          note={`${events.length} ${events.length === 1 ? "entry" : "entries"}, newest first`}
        >
          {events.length === 0 ? (
            <p className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
              <History className="size-6 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">Nothing recorded yet</span>
              <span className="max-w-md text-sm text-muted-foreground">
                Submitting a report, reading it, grouping reports and every review action all appear here.
              </span>
            </p>
          ) : (
            <div className="flex flex-col gap-7">
              {groups.map((group) => (
                <section key={group.key} aria-label={group.label}>
                  <h3 className="mb-3 flex items-baseline gap-3 text-sm font-bold tracking-tight">
                    {group.label}
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      {group.entries.length}
                    </span>
                  </h3>
                  <ul className="grid auto-rows-fr gap-3 md:grid-cols-2">
                    {group.entries.slice(0, 60).map((event) => (
                      <li key={event.id} className="flex">
                        <RecordCard event={event} timeZone={region.timezone} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {events.length > 200 ? (
            <p className="mt-5 border-t border-border/70 pt-4 text-center text-xs text-muted-foreground">
              Showing the 200 most recent of {events.length}.
            </p>
          ) : null}
        </SectionCard>

        <div className="xl:sticky xl:top-20">
          <SectionCard title="Who did what" note="The whole record">
            <StackedBar slices={slices} total={all.length} unit="event" />
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
