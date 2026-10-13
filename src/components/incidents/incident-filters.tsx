"use client";

// Narrowing the board, and choosing how to read it.
//
// State lives in the URL like every other filter in this app, so a view can be handed over in a
// message. The control is one button rather than a row of pills: the board is the point of the page,
// and a permanent row of controls above it competes with it.

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, LayoutGrid, ListFilter, Rows3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const STATUSES = [
  { value: "candidate", label: "Needs review" },
  { value: "under_review", label: "Under review" },
  { value: "verified", label: "Verified" },
  { value: "dismissed", label: "Dismissed" },
] as const;

const WINDOWS = [
  { value: "24", label: "Last 24 hours" },
  { value: "72", label: "Last 3 days" },
  { value: "168", label: "Last 7 days" },
  { value: "720", label: "Last 30 days" },
] as const;

const TRIGGER = "h-9 rounded-full border-border bg-card px-3.5 text-xs font-medium";

export function IncidentFilters({ total, shown }: { total: number; shown: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const statuses = params.getAll("status");
  const window = params.get("window") ?? "";
  const view = params.get("view") === "list" ? "list" : "board";
  const filtered = Boolean(statuses.length || window);

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            TRIGGER,
            "inline-flex items-center gap-2 border transition-colors hover:bg-accent",
            filtered ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <ListFilter className="size-3.5" aria-hidden />
          Filters
          {filtered ? (
            <span className="grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground tabular-nums">
              {statuses.length + (window ? 1 : 0)}
            </span>
          ) : null}
        </PopoverTrigger>

        <PopoverContent align="end" className="w-64 gap-3 p-3">
          <div className="flex flex-col gap-1">
            <p className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Show only</p>
            {STATUSES.map((status) => {
              const active = statuses.includes(status.value);
              return (
                <button
                  key={status.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleStatus(status.value)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent",
                    active && "font-semibold",
                  )}
                >
                  {status.label}
                  {active ? <Check className="size-3.5 text-leaf-strong" aria-hidden /> : null}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <p className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Last reported
            </p>
            {WINDOWS.map((option) => {
              const active = window === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    update((next) => {
                      if (active) next.delete("window");
                      else next.set("window", option.value);
                    })
                  }
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent",
                    active && "font-semibold",
                  )}
                >
                  {option.label}
                  {active ? <Check className="size-3.5 text-leaf-strong" aria-hidden /> : null}
                </button>
              );
            })}
          </div>

          {filtered ? (
            <div className="border-t border-border pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => router.push(view === "list" ? `${pathname}?view=list` : pathname)}
                className="w-full rounded-full text-xs"
              >
                <X className="size-3.5" aria-hidden />
                Clear filters
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      <p className="text-xs text-muted-foreground tabular-nums">
        {shown === total ? `${total} shown` : `${shown} of ${total}`}
      </p>

      <div
        role="group"
        aria-label="How to show the incidents"
        className="inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5"
      >
        {(
          [
            { value: "board", label: "Board", Icon: LayoutGrid },
            { value: "list", label: "List", Icon: Rows3 },
          ] as const
        ).map((option) => {
          const active = option.value === view;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              title={option.label}
              onClick={() =>
                update((next) => {
                  if (option.value === "board") next.delete("view");
                  else next.set("view", option.value);
                })
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              <option.Icon className="size-3.5" aria-hidden />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
