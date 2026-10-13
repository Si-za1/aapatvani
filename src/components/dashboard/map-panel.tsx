"use client";

// A thin client boundary for the map. `ssr: false` is only allowed inside a Client Component, so the
// dashboard page (a Server Component) renders this instead of the Leaflet component directly.

import dynamic from "next/dynamic";
import type { MapPoint } from "@/lib/dashboard/service";
import { cn } from "@/lib/utils";

const IncidentMap = dynamic(() => import("./incident-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[26rem] w-full animate-pulse rounded-2xl border border-border bg-sand sm:h-[28rem]" aria-hidden />
  ),
});

export function MapPanel(props: {
  points: MapPoint[];
  center: [number, number];
  zoom: number;
  tileUrl: string;
  attribution: string;
  className?: string;
}) {
  const { className, ...rest } = props;
  return <IncidentMap {...rest} className={cn("h-[26rem] sm:h-[28rem]", className)} />;
}
