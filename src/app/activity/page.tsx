import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Bot, History, User, Wrench } from "lucide-react";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { Card } from "@/components/ui/card";
import { requireReviewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { Actor } from "@/lib/domain/schemas";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

// The audit trail (feature M5). Append-only: nothing here is ever edited or deleted, so the page can
// answer "who decided this, and when?" long after the decision.
//
// The three actor kinds are kept visibly apart, a model's output and a person's decision must never
// look like the same kind of statement. That is the whole trust model in one screen.

export const metadata: Metadata = { title: "Activity" };

const ACTOR: Record<Actor["kind"], { label: string; className: string; Icon: typeof User }> = {
  human: { label: "Person", className: "bg-leaf-tint text-leaf-strong", Icon: User },
  ai: { label: "AI", className: "bg-violet-tint text-violet-strong", Icon: Bot },
  system: { label: "System", className: "bg-moss-tint text-moss-strong", Icon: Wrench },
  public: { label: "Reporter", className: "bg-coral-tint text-coral-strong", Icon: User },
};

const FILTERS = [
  { key: "all", label: "Everything" },
  { key: "human", label: "People" },
  { key: "ai", label: "AI" },
  { key: "system", label: "System" },
  { key: "public", label: "Reporters" },
] as const;

export default function ActivityPage({ searchParams }: PageProps<"/activity">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse bg-sand" aria-hidden />}>
      <Screen searchParams={searchParams} />
    </Suspense>
  );
}

async function Screen({ searchParams }: { searchParams: PageProps<"/activity">["searchParams"] }) {
  const reviewer = await requireReviewer("/activity");
  const params = await searchParams;
  const actor = (FILTERS.find((f) => f.key === params.actor)?.key ?? "all") as (typeof FILTERS)[number]["key"];

  const db = getDb();
  const all = await db.events.list({ orderBy: { field: "at", direction: "desc" } });
  const events = actor === "all" ? all : all.filter((event) => event.actor.kind === actor);

  const counts = {
    human: all.filter((e) => e.actor.kind === "human").length,
    ai: all.filter((e) => e.actor.kind === "ai").length,
    system: all.filter((e) => e.actor.kind === "system").length,
    public: all.filter((e) => e.actor.kind === "public").length,
  };

  return (
    <AppShell current="/activity" reviewer={reviewer}>
      <PageHeader
        title="Activity"
        description="Every action that changed something, in order, with who or what caused it. Nothing is ever edited or removed."
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((option) => {
            const active = option.key === actor;
            const count = option.key === "all" ? all.length : counts[option.key as keyof typeof counts];
            return (
              <Link
                key={option.key}
                href={option.key === "all" ? "/activity" : `/activity?actor=${option.key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent",
                )}
              >
                {option.label}
                <span className="tabular-nums opacity-70">{count}</span>
              </Link>
            );
          })}
        </div>
      </PageHeader>

      <div className="flex flex-col gap-4 px-5 py-6 sm:px-8">
        {events.length === 0 ? (
          <p className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <History className="size-6 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Nothing recorded yet</span>
            <span className="text-sm text-muted-foreground">
              Submitting a report, reading it, grouping reports and every review action all appear here.
            </span>
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {events.slice(0, 200).map((event) => {
              const actorTone = ACTOR[event.actor.kind] ?? ACTOR.system;
              return (
                <li key={event.id}>
                  <Card className="flex-row items-start gap-3 p-3.5">
                    <span className={cn("mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full", actorTone.className)} aria-hidden>
                      <actorTone.Icon className="size-3.5" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-sm">{event.summary}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className={cn("rounded-full px-2 py-0.5 font-medium", actorTone.className)}>
                          {actorTone.label}
                          {event.actor.name ? ` · ${event.actor.name}` : ""}
                        </span>
                        <span className="font-mono">{event.action}</span>
                        <span>{formatDateTime(event.at, "Asia/Kathmandu")}</span>
                        {event.reportId ? (
                          <Link href={`/reports/${event.reportId}`} className="underline">
                            the report
                          </Link>
                        ) : null}
                        {event.incidentId ? (
                          <Link href={`/incidents/${event.incidentId}`} className="underline">
                            the incident
                          </Link>
                        ) : null}
                      </div>
                      {event.note ? <p className="text-xs text-muted-foreground">Note: {event.note}</p> : null}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ol>
        )}

        {events.length > 200 ? (
          <p className="text-center text-xs text-muted-foreground">Showing the 200 most recent of {events.length}.</p>
        ) : null}
      </div>
    </AppShell>
  );
}
