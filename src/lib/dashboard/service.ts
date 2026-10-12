import "server-only";

// What the dashboard needs, in one place (features M10/S3).
//
// The reviewer pages read the store directly rather than through the HTTP API: they are server
// components, so a fetch to our own origin would be a round trip to ourselves. The API routes stay
// for what only a client can do, mutations and polling.

import { getDb } from "@/lib/db";
import type { Incident, IncidentStatus, Report } from "@/lib/domain/schemas";
import { reportPoint } from "@/lib/matching/candidates";
import { usableClaims } from "@/lib/matching/similarity";

export interface DashboardFilters {
  hazard?: string;
  statuses?: IncidentStatus[];
  /** Only show activity from the last N hours. */
  windowHours?: number;
}

export interface MapPoint {
  id: string;
  kind: "incident" | "report";
  lat: number;
  lng: number;
  label: string;
  href: string;
  /** Drives the icon and colour; the legend spells both out in words. */
  tone: "verified" | "candidate" | "dismissed" | "report";
  detail: string;
  reportedAt: string;
}

export interface ActivityEntry {
  id: string;
  referenceCode: string;
  submittedAt: string;
  hazard?: string;
  place?: string;
  status: Report["status"];
  incidentId?: string;
}

export interface DashboardData {
  stats: {
    incidents: number;
    candidateIncidents: number;
    verifiedIncidents: number;
    openContradictions: number;
    reports: number;
    awaitingReview: number;
    aiUnavailable: number;
    last24h: number;
  };
  incidents: Incident[];
  activity: ActivityEntry[];
  points: MapPoint[];
  /** Hazards actually present in the data, so the filter offers only real choices. */
  hazardsInUse: string[];
}

const AWAITING: Report["status"][] = ["extracted", "extraction_failed"];

function withinWindow(iso: string, hours: number | undefined): boolean {
  if (!hours) return true;
  return Date.parse(iso) >= Date.now() - hours * 3_600_000;
}

function incidentTone(status: IncidentStatus): MapPoint["tone"] {
  if (status === "verified") return "verified";
  if (status === "dismissed") return "dismissed";
  return "candidate";
}

export async function dashboardData(filters: DashboardFilters = {}): Promise<DashboardData> {
  const db = getDb();
  const [allIncidents, allReports] = await Promise.all([
    db.incidents.list({ orderBy: { field: "lastReportedAt", direction: "desc" } }),
    db.reports.list({ orderBy: { field: "submittedAt", direction: "desc" } }),
  ]);

  const reports = allReports;
  const hazardsInUse = [...new Set(reports.map((r) => r.reporterHazard).filter((h): h is string => Boolean(h)))].sort();

  // Filters narrow the lists and the map, but the tiles always describe the whole picture: a
  // filtered-out incident still needs to be counted somewhere, or the numbers would look calm.
  const incidents = allIncidents.filter((incident) => {
    if (filters.hazard && incident.hazard.category !== filters.hazard) return false;
    if (filters.statuses?.length && !filters.statuses.includes(incident.status)) return false;
    if (!withinWindow(incident.lastReportedAt, filters.windowHours)) return false;
    return true;
  });
  const visibleReports = reports.filter((report) => {
    if (filters.hazard && report.reporterHazard !== filters.hazard) return false;
    if (!withinWindow(report.submittedAt, filters.windowHours)) return false;
    return true;
  });

  const incidentById = new Map(allIncidents.map((i) => [i.id, i]));
  const points: MapPoint[] = [];

  for (const incident of incidents) {
    if (!incident.location) continue;
    points.push({
      id: `incident:${incident.id}`,
      kind: "incident",
      lat: incident.location.lat,
      lng: incident.location.lng,
      label: incident.title,
      href: `/incidents/${incident.id}`,
      tone: incidentTone(incident.status),
      detail: `${incident.independentSources} independent source${incident.independentSources === 1 ? "" : "s"}${
        incident.openContradictions ? ` · ${incident.openContradictions} open contradiction${incident.openContradictions === 1 ? "" : "s"}` : ""
      }`,
      reportedAt: incident.lastReportedAt,
    });
  }

  for (const report of visibleReports) {
    // Reports that sit inside an incident are drawn by that incident, not twice over.
    if (report.incidentId && incidentById.has(report.incidentId)) continue;
    const claims = usableClaims(await db.claims.list({ where: [{ field: "reportId", op: "==", value: report.id }] }));
    const point = reportPoint(report, claims);
    if (!point) continue;
    points.push({
      id: `report:${report.id}`,
      kind: "report",
      lat: point.lat,
      lng: point.lng,
      label: report.referenceCode,
      href: `/reports/${report.id}`,
      tone: "report",
      detail: point.source === "gazetteer" ? "Placed from a place name" : "Not yet grouped into an incident",
      reportedAt: report.submittedAt,
    });
  }

  const activity: ActivityEntry[] = visibleReports.slice(0, 12).map((report) => ({
    id: report.id,
    referenceCode: report.referenceCode,
    submittedAt: report.submittedAt,
    hazard: report.reporterHazard,
    place: report.location.placeText,
    status: report.status,
    incidentId: report.incidentId,
  }));

  return {
    stats: {
      incidents: allIncidents.length,
      candidateIncidents: allIncidents.filter((i) => i.status === "candidate").length,
      verifiedIncidents: allIncidents.filter((i) => i.status === "verified").length,
      openContradictions: allIncidents.reduce((sum, i) => sum + i.openContradictions, 0),
      reports: reports.length,
      awaitingReview: reports.filter((r) => AWAITING.includes(r.status)).length,
      aiUnavailable: reports.filter((r) => r.status === "ai_unavailable" || r.status === "received").length,
      last24h: reports.filter((r) => withinWindow(r.submittedAt, 24)).length,
    },
    incidents,
    activity,
    points,
    hazardsInUse,
  };
}
