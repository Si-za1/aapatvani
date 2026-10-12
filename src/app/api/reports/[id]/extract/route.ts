import { fail, handle, ok } from "@/lib/api";
import { getLlm } from "@/lib/ai/gemini";
import { assertSameOrigin, getReviewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { runMatchingForReport } from "@/lib/matching/service";
import { runExtractionForReport, submitTokenMatches } from "@/lib/reports/service";

/**
 * Runs Gemini extraction for a report, then matching.
 *
 * Two callers are allowed: the browser that submitted the report (it holds the submit token), and
 * any signed-in reviewer, who may re-run extraction whenever they like. Each run appends a new
 * extraction record; earlier ones are kept.
 */
export const POST = (request: Request, ctx: RouteContext<"/api/reports/[id]/extract">) =>
  handle(async () => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const db = getDb();
    const report = await db.reports.get(id);
    if (!report) return fail(404, "That report does not exist.");

    const body = (await request.json().catch(() => ({}))) as { submitToken?: string; match?: boolean; rulesOnly?: boolean };
    const reviewer = await getReviewer();
    if (!reviewer && !submitTokenMatches(report, body.submitToken)) {
      return fail(403, "Only the device that sent this report, or a signed-in reviewer, can run extraction.");
    }

    const llm = getLlm();
    const result = await runExtractionForReport(id, llm);

    // Matching runs straight after extraction so a new report lands in the review queue grouped.
    const match =
      body.match === false
        ? null
        : await runMatchingForReport(id, llm, { rulesOnly: body.rulesOnly ?? false });

    return ok({
      report: result.report,
      extraction: result.extraction,
      aiAvailable: result.aiAvailable,
      message: result.message,
      matching: match
        ? {
            incidentId: match.incident?.id ?? null,
            suggestions: match.suggestions.length,
            contradictions: match.contradictions.length,
            comparedWithModel: match.comparedWithModel,
            notes: match.notes,
          }
        : null,
    });
  });
