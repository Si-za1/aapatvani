"use client";

// Filtering for the report cards. A button rather than a permanent row of controls: the grid is the
// point of the page, and most visits do not need to narrow anything.
//
// State lives in the URL, so a filtered view can be linked to a colleague or survive a refresh.

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { hazardLabel, getRegion } from "@/config/regions";
import { cn } from "@/lib/utils";

const STATUSES = [
  { value: "awaiting", label: "Awaiting review" },
  { value: "all", label: "All" },
  { value: "unread", label: "Not read automatically" },
] as const;

const WINDOWS = [
  { value: "24", label: "Last 24 hours" },
  { value: "168", label: "Last 7 days" },
  { value: "720", label: "Last 30 days" },
] as const;

export function ReportFilters({
  hazards,
  regionId,
  total,
  defaultStatus,
}: {
  hazards: string[];
  regionId: string;
  total: number;
  /** From the reviewer's own settings, so the page opens where they left it. */
  defaultStatus: (typeof STATUSES)[number]["value"];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const hazard = params.get("hazard") ?? "";
  const window = params.get("window") ?? "";
  const status = params.get("status") ?? defaultStatus;
  const active = Boolean(hazard || window) || status !== defaultStatus;

  function update(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const setParam = (key: string, value: string | null, fallback?: string) =>
    update((next) => {
      if (!value || value === fallback) next.delete(key);
      else next.set(key, value);
    });

  return (
    // The panel floats over the page rather than sitting in the flow: in the flow it made the header
    // tall, which pushed every card down the page and left a band of empty space beside it.
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
          active || open ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent",
        )}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Filter
        <span className="tabular-nums opacity-70">{total}</span>
      </button>

      {open ? (
        <>
          {/* Click anywhere else to dismiss, which is what a panel like this should do. */}
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute top-full right-0 z-20 mt-2 flex w-[19rem] flex-col gap-4 rounded-2xl bg-card p-5 shadow-[0_10px_40px_rgba(28,31,24,0.14)] sm:w-[24rem]">
            <Group label="Show">
              {STATUSES.map((option) => (
                <Chip
                  key={option.value}
                  active={status === option.value}
                  onClick={() => setParam("status", option.value, "awaiting")}
                  label={option.label}
                />
              ))}
            </Group>

            <Group label="Hazard">
              <Chip active={!hazard} onClick={() => setParam("hazard", null)} label="Any" />
              {hazards.map((id) => (
                <Chip
                  key={id}
                  active={hazard === id}
                  onClick={() => setParam("hazard", id)}
                  label={hazardLabel(getRegion(regionId), id)}
                />
              ))}
            </Group>

            <Group label="When">
              <Chip active={!window} onClick={() => setParam("window", null)} label="Any time" />
              {WINDOWS.map((option) => (
                <Chip
                  key={option.value}
                  active={window === option.value}
                  onClick={() => setParam("window", option.value)}
                  label={option.label}
                />
              ))}
            </Group>

            {active ? (
              <button
                type="button"
                onClick={() => router.push(pathname)}
                className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:underline"
              >
                <X className="size-3.5" aria-hidden />
                Clear all filters
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}
