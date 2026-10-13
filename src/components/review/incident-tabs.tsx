"use client";

// The incident workspace, in four parts.
//
// It was one page, and by the end of a real review it ran to six thousand pixels: membership,
// fourteen suggested matches, three contradictions, a road analysis and an alert draft, one under
// the other, with no way to see the shape of the thing without scrolling through all of it. A
// responder arriving at an incident needs to know what it is, why we think so, and where — and then
// to work on one part of that at a time.
//
// So: a strip of facts that is always visible, and four panels behind a switch. Nothing is removed —
// every action that was on the page is still on the page, in the panel it belongs to — and the
// switch itself carries the state of each part, so a reviewer can see from the bar that the road
// analysis has not been run without opening it.
//
// The open panel lives in the URL, like every other filter in this app, so a link to "the road
// analysis for this incident" is a link somebody can send.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export interface IncidentTab {
  key: string;
  label: string;
  /** A count or a state, shown on the switch itself. */
  badge?: string;
  /** Draws the badge in the "still needs a person" colour rather than the neutral one. */
  attention?: boolean;
  content: React.ReactNode;
}

export function IncidentTabs({ tabs, fallback }: { tabs: IncidentTab[]; fallback: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const requested = params.get("tab");
  const active = tabs.find((tab) => tab.key === requested) ?? tabs.find((tab) => tab.key === fallback) ?? tabs[0];

  function select(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set("tab", key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Parts of this incident"
        className="flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-card p-1"
      >
        {tabs.map((tab) => {
          const selected = tab.key === active.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.key}`}
              onClick={() => select(tab.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors",
                selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.badge ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    selected
                      ? "bg-white/20 text-primary-foreground"
                      : tab.attention
                        ? "bg-amber-tint text-amber-strong"
                        : "bg-sand text-muted-foreground",
                  )}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${active.key}`} aria-labelledby={`tab-${active.key}`}>
        {active.content}
      </div>
    </div>
  );
}
