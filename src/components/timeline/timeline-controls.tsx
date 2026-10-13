"use client";

// What the timeline is showing, and how finely it is cut.
//
// Both live in the URL, like every other filter in this app, so a view of one hazard over one week
// can be linked into a handover note. The granularity control is a segmented switch rather than a
// dropdown because there are three of them and the reader changes between them while reading.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getRegion, hazardLabel } from "@/config/regions";
import { GRANULARITIES, type Granularity } from "@/lib/timeline/group";
import { cn } from "@/lib/utils";

export function TimelineControls({
  categories,
  regionId,
  granularity,
  category,
}: {
  categories: Array<{ id: string; count: number }>;
  regionId: string;
  granularity: Granularity;
  category?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const region = getRegion(regionId);

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Everything on the left, one hazard at a time on the right. Each chip says how much is
          behind it, so choosing one is not a guess about what is in there. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={!category} onClick={() => set("category", null)}>
          Everything
        </Chip>
        {categories.map((entry) => (
          <Chip
            key={entry.id}
            active={category === entry.id}
            onClick={() => set("category", category === entry.id ? null : entry.id)}
          >
            {hazardLabel(region, entry.id)}
            <span className="tabular-nums opacity-60">{entry.count}</span>
          </Chip>
        ))}
      </div>

      <div
        role="group"
        aria-label="Group the timeline by"
        className="ml-auto inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5"
      >
        {GRANULARITIES.map((option) => {
          const active = option.value === granularity;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => set("group", option.value === "day" ? null : option.value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-card text-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
