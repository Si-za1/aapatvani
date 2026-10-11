import type { Claim, Report } from "@/lib/domain/schemas";
import type { GazetteerEntry } from "@/lib/geo/dataset-types";

export function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: "rep_TESTREPORT0001",
    referenceCode: "AV-TEST01",
    regionId: "np",
    dataLabel: "synthetic",
    text: "लार्चा नजिक अरनिको राजमार्गमा बिहान ठूलो पहिरो खस्यो। बाटो पूरै बन्द छ। ३ जना घाइते भएका छन्।",
    uiLanguage: "ne",
    location: { source: "place_name", placeText: "लार्चा" },
    timeHint: "earlier_today",
    reportedTimeText: "आज बिहान ६ बजे",
    submittedAt: "2026-07-14T01:30:00.000Z",
    media: [],
    reporterToken: "tok_reporter_a",
    status: "received",
    ...overrides,
  };
}

export function makeClaim(overrides: Partial<Claim> & Pick<Claim, "id" | "reportId">): Claim {
  return {
    extractionId: "ext_TEST",
    regionId: "np",
    type: "event",
    statement: "A landslide blocked the road",
    statementEn: "A landslide blocked the road",
    origin: "reporter",
    basis: "report_text",
    review: { status: "unreviewed" },
    createdAt: "2026-07-14T01:31:00.000Z",
    ...overrides,
  };
}

export const GAZETTEER: GazetteerEntry[] = [
  { id: "osm:node/11", name: "Larcha", nameNe: "लार्चा", alt: [], kind: "hamlet", lat: 27.93309, lng: 85.93534, uncertaintyM: 500, source: "test" },
  { id: "osm:node/12", name: "Kabhre", nameNe: "काभ्रे", alt: [], kind: "hamlet", lat: 27.7883, lng: 85.9636, uncertaintyM: 500, source: "test" },
  { id: "osm:node/13", name: "Kabhre", nameNe: "काभ्रे", alt: [], kind: "hamlet", lat: 27.8154, lng: 85.8942, uncertaintyM: 500, source: "test" },
  { id: "osm:node/10", name: "Tatopani", nameNe: "तातोपानी", alt: [], kind: "suburb", lat: 27.94484, lng: 85.94901, uncertaintyM: 800, source: "test" },
];
