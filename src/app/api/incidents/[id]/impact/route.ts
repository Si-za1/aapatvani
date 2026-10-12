import { handle, ok } from "@/lib/api";
import { getLlm } from "@/lib/ai/gemini";
import { assertSameOrigin, requireReviewerApi } from "@/lib/auth";
import { runImpactAssessment } from "@/lib/impact/service";

/**
 * Runs the Blast Radius analysis for an incident and stores it as a new version (feature M9/S5).
 * Deterministic geography: the same incident and the same dataset always give the same answer.
 */
export const POST = (request: Request, ctx: RouteContext<"/api/incidents/[id]/impact">) =>
  handle(async () => {
    assertSameOrigin(request);
    const reviewer = await requireReviewerApi();
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { withExplanation?: boolean; rulesOnly?: boolean };

    const assessment = await runImpactAssessment({
      incidentId: id,
      reviewer,
      llm: body.rulesOnly ? null : getLlm(),
      withExplanation: body.withExplanation ?? true,
    });
    return ok({ assessment }, 201);
  });
