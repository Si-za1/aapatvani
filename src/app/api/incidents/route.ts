import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { requireReviewerApi } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { IncidentStatus } from "@/lib/domain/schemas";

/** The incident list behind the dashboard, with the filters it needs (features M10/S3). */
export const GET = (request: NextRequest) =>
  handle(async () => {
    await requireReviewerApi();
    const db = getDb();
    const params = request.nextUrl.searchParams;

    const statuses = params.getAll("status") as IncidentStatus[];
    const limit = Math.min(Number(params.get("limit") ?? 200) || 200, 500);

    let incidents = await db.incidents.list({ orderBy: { field: "lastReportedAt", direction: "desc" } });
    if (statuses.length) incidents = incidents.filter((i) => statuses.includes(i.status));
    const hazard = params.get("hazard");
    if (hazard) incidents = incidents.filter((i) => i.hazard.category === hazard);

    const reports = await db.reports.list({});
    const awaitingReview = reports.filter((r) => r.status === "extracted" || r.status === "extraction_failed").length;
    const aiUnavailable = reports.filter((r) => r.status === "ai_unavailable").length;

    return ok({
      incidents: incidents.slice(0, limit),
      total: incidents.length,
      stats: {
        incidents: incidents.length,
        candidateIncidents: incidents.filter((i) => i.status === "candidate").length,
        verifiedIncidents: incidents.filter((i) => i.status === "verified").length,
        openContradictions: incidents.reduce((sum, i) => sum + i.openContradictions, 0),
        reports: reports.length,
        awaitingReview,
        aiUnavailable,
      },
    });
  });
