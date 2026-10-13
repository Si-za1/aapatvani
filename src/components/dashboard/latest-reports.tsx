// What has just arrived.
//
// Tiles rather than a table. The old version was five columns of small type, which is a lot of
// reading to answer "is there anything new?", and the Reports page already does the full table job.
// Here a tile only has to say three things: what it is, where, and whether a person has been
// through it yet.

import Link from "next/link";
import { HazardGlyph } from "@/components/av/hazard-icon";
import { getRegion, hazardIcon, hazardLabel } from "@/config/regions";
import type { ActivityEntry } from "@/lib/dashboard/service";
import type { Report } from "@/lib/domain/schemas";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const STATUS: Record<Report["status"], { label: string; dot: string; className: string }> = {
  received: { label: "Not read", dot: "bg-amber", className: "text-amber-strong" },
  extracting: { label: "Reading", dot: "bg-violet", className: "text-violet-strong" },
  extracted: { label: "Awaiting review", dot: "bg-violet", className: "text-violet-strong" },
  extraction_failed: { label: "Reading failed", dot: "bg-flame", className: "text-flame-strong" },
  ai_unavailable: { label: "Awaiting a person", dot: "bg-amber", className: "text-amber-strong" },
};

export function LatestReports({ reports, regionId }: { reports: ActivityEntry[]; regionId: string }) {
  const region = getRegion(regionId);

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {reports.map((report) => {
        const status = STATUS[report.status] ?? STATUS.received;
        return (
          <li key={report.id}>
            <Link
              href={`/reports/${report.id}`}
              className="flex h-full flex-col gap-3 rounded-2xl bg-background p-3.5 transition-colors hover:bg-sand/70"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-sand text-ink-soft">
                  <HazardGlyph icon={hazardIcon(region, report.hazard)} className="size-4" />
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{report.referenceCode}</span>
              </span>

              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">
                  {report.place ?? <span className="font-normal text-muted-foreground">Location not named</span>}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {report.hazard ? hazardLabel(region, report.hazard) : "Hazard not stated"}
                </span>
              </span>

              <span className="mt-auto flex items-center justify-between gap-2">
                <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold", status.className)}>
                  <span className={cn("size-1.5 rounded-full", status.dot)} aria-hidden />
                  {status.label}
                </span>
                <span className="text-[11px] text-muted-foreground">{relativeTime(report.submittedAt)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
