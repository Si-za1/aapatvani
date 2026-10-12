"use client";

// Dashboard filters (should-have S3). State lives in the URL, not in component state, so a filtered
// view can be linked to a colleague or reopened after a refresh — which matters when someone is
// handing over a shift.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hazardLabel, getRegion } from "@/config/regions";
import { cn } from "@/lib/utils";

const STATUSES = [
  { value: "candidate", label: "Candidate" },
  { value: "under_review", label: "Under review" },
  { value: "verified", label: "Verified" },
  { value: "dismissed", label: "Dismissed" },
] as const;

const WINDOWS = [
  { value: "24", label: "Last 24 hours" },
  { value: "72", label: "Last 3 days" },
  { value: "168", label: "Last 7 days" },
] as const;

export function DashboardFilters({ hazards, regionId }: { hazards: string[]; regionId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const hazard = params.get("hazard") ?? "";
  const window = params.get("window") ?? "";
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

  const filtered = Boolean(hazard || window || statuses.length);

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
        <SelectTrigger className="h-9 w-44 rounded-full" aria-label="Filter by hazard">
          <SelectValue placeholder="All hazards" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All hazards</SelectItem>
          {hazards.map((id) => (
            <SelectItem key={id} value={id}>
              {hazardLabel(getRegion(regionId), id)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {STATUSES.map((status) => {
        const active = statuses.includes(status.value);
        return (
          <button
            key={status.value}
            type="button"
            aria-pressed={active}
            onClick={() => toggleStatus(status.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent",
            )}
          >
            {status.label}
          </button>
        );
      })}

      <Select
        value={window || "all"}
        onValueChange={(value) =>
          update((next) => {
            if (value === "all") next.delete("window");
            else next.set("window", value);
          })
        }
      >
        <SelectTrigger className="h-9 w-36 rounded-full" aria-label="Filter by time">
          <SelectValue placeholder="Any time" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any time</SelectItem>
          {WINDOWS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
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
