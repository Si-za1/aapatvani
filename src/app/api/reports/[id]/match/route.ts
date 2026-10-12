import { fail, handle, ok } from "@/lib/api";
import { getLlm } from "@/lib/ai/gemini";
import { assertSameOrigin, requireReviewerApi } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { runMatchingForReport } from "@/lib/matching/service";

/** Re-runs matching for one report. Reviewer-only: it writes suggestions and flags contradictions. */
export const POST = (request: Request, ctx: RouteContext<"/api/reports/[id]/match">) =>
  handle(async () => {
    assertSameOrigin(request);
    const reviewer = await requireReviewerApi();
    const { id } = await ctx.params;

    const db = getDb();
    const report = await db.reports.get(id);
    if (!report) return fail(404, "That report does not exist.");

    const body = (await request.json().catch(() => ({}))) as { rulesOnly?: boolean };
    const result = await runMatchingForReport(id, getLlm(), { rulesOnly: body.rulesOnly ?? false });

    return ok({
      incident: result.incident,
      suggestions: result.suggestions,
      contradictions: result.contradictions,
      comparedWithModel: result.comparedWithModel,
      aiAvailable: result.aiAvailable,
      skipped: result.skipped,
      notes: result.notes,
      runBy: reviewer.name,
    });
  });
