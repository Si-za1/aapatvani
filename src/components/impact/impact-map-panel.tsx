"use client";

// Client boundary for the Blast Radius map: `ssr: false` is only allowed inside a Client Component,
// and Leaflet needs `window` anyway.

import dynamic from "next/dynamic";
import type { ImpactAssessment } from "@/lib/domain/schemas";

const ImpactMap = dynamic(() => import("./impact-map"), {
  ssr: false,
  loading: () => <div className="h-[24rem] animate-pulse rounded-2xl border border-border bg-sand" aria-hidden />,
});

export function ImpactMapPanel(props: {
  assessment: ImpactAssessment;
  incident: { lat: number; lng: number; label: string };
  center: [number, number];
  zoom: number;
  tileUrl: string;
  attribution: string;
}) {
  return <ImpactMap {...props} />;
}
