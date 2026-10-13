"use client";

// Dashboard filters (should-have S3). State lives in the URL, not in component state, so a filtered
// view can be linked to a colleague or reopened after a refresh, which matters when someone is
// handing over a shift.
//
// Three controls and no more. The status filter used to be four buttons standing open in the header,
// which made the top of the page look like a form; it is the same four choices behind one control
// now, and it says how many are on.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ListFilter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getRegion, hazardLabel } from "@/config/regions";
import { WINDOW_CHOICES } from "@/lib/pref-choices";
import { cn } from "@/lib/utils";

const STATUSES = [
  { value: "candidate", label: "Needs review" },
  { value: "under_review", label: "Under review" },
  { value: "verified", label: "Verified" },
  { value: "dismissed", label: "Dismissed" },
] as const;

/** The trigger for every control here: one height, one shape, one weight. */
const TRIGGER = "h-9 rounded-full border-border bg-card px-3.5 text-xs font-medium";

export function DashboardFilters({
  hazards,
  regionId,
  windowHours,
}: {
  hazards: string[];
  regionId: string;
  /** The window the overview opens on, from the reviewer's own settings. */
  windowHours: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const hazard = params.get("hazard") ?? "";
  const requested = params.get("window");
  const window = requested ?? (windowHours ? String(windowHours) : "all");
  const statuses = params.getAll("status");

  function update(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function toggleStatus(value: string) {
    update((next) => {
      const current = next.getAll("status");
      next.delete("status");
      const updated = current.includes(value) ? current.filter((s) => s !== value) : [...current, value];
      for (const status of updated) next.append("status", status);
    });
  }

  const filtered = Boolean(hazard || requested || statuses.length);
  const region = getRegion(regionId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={hazard || "all"}
        onValueChange={(value) =>
          update((next) => {
            if (value === "all") next.delete("hazard");
            else next.set("hazard", value);
          })
        }
      >
        <SelectTrigger className={cn(TRIGGER, "w-40")} aria-label="Filter by hazard">
          <SelectValue placeholder="All hazards" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All hazards</SelectItem>
          {hazards.map((id) => (
            <SelectItem key={id} value={id}>
              {hazardLabel(region, id)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger
          className={cn(
            TRIGGER,
            "inline-flex items-center gap-2 border transition-colors hover:bg-accent",
            statuses.length ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <ListFilter className="size-3.5" aria-hidden />
          Status
          {statuses.length ? (
            <span className="grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground tabular-nums">
              {statuses.length}
            </span>
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 gap-1 p-1.5">
          <p className="px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Show only
          </p>
          {STATUSES.map((status) => {
            const active = statuses.includes(status.value);
            return (
              <button
                key={status.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleStatus(status.value)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent",
                  active ? "font-semibold" : "text-muted-foreground",
                )}
              >
                {status.label}
                {active ? <Check className="size-3.5 text-leaf-strong" aria-hidden /> : null}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>

      <Select
        value={window}
        onValueChange={(value) =>
          update((next) => {
            if (value === "all") next.delete("window");
            else next.set("window", value);
          })
        }
      >
        <SelectTrigger className={cn(TRIGGER, "w-36", !requested && "text-muted-foreground")} aria-label="Filter by time">
          <SelectValue placeholder="Any time" />
        </SelectTrigger>
        <SelectContent>
          {WINDOW_CHOICES.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
              {!requested && option.value === window ? " (default)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filtered ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push(pathname)}
          className="h-9 rounded-full text-xs"
        >
          <X className="size-3.5" aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
