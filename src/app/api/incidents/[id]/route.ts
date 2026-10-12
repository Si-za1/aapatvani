import { fail, handle, ok } from "@/lib/api";
import { requireReviewerApi } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { incidentClaims } from "@/lib/incidents/service";
import { latestAssessment, confirmedCandidates } from "@/lib/impact/service";
import { latestAlert } from "@/lib/alerts/service";

/** The incident workspace: members, claims, suggestions, contradictions and the latest analysis. */
export const GET = (_request: Request, ctx: RouteContext<"/api/incidents/[id]">) =>
  handle(async () => {
    await requireReviewerApi();
    const { id } = await ctx.params;
    const db = getDb();

    const incident = await db.incidents.get(id);
    if (!incident) return fail(404, "That incident does not exist.");

    const [reports, claims, contradictions, assessment, alert] = await Promise.all([
      db.reports.getMany(incident.reportIds),
      incidentClaims(incident),
      db.contradictions.list({ where: [{ field: "incidentId", op: "==", value: id }] }),
      latestAssessment(id),
      latestAlert(id),
    ]);

    // Suggestions point at a pair of reports rather than at an incident, and there is no OR query
    // here, so they are filtered from the region's list by membership.
    const reportIds = new Set(incident.reportIds);
    const inRegion = await db.suggestions.list({ where: [{ field: "regionId", op: "==", value: incident.regionId }] });
    const suggestions = inRegion.filter((s) => s.reportIds.some((rid) => reportIds.has(rid)));

    return ok({
      incident,
      reports,
      claims,
      suggestions,
      contradictions,
      assessment,
      confirmedImpactCandidates: confirmedCandidates(assessment),
      alert,
    });
  });
