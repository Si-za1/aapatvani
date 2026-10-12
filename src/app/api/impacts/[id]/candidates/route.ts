import { z } from "zod";
import { handle, jsonBody, ok } from "@/lib/api";
import { assertSameOrigin, requireReviewerApi } from "@/lib/auth";
import { reviewImpactCandidate } from "@/lib/impact/service";

const bodySchema = z.object({
  candidateId: z.string(),
  decision: z.enum(["confirmed", "dismissed", "needs_info"]),
  note: z.string().max(1_000).optional(),
});

/**
 * Confirms or dismisses one impact candidate (feature M9). A confirmed candidate is the only kind
 * an alert draft may draw on; a dismissed one is kept but never cited.
 */
export const POST = (request: Request, ctx: RouteContext<"/api/impacts/[id]/candidates">) =>
  handle(async () => {
    assertSameOrigin(request);
    const reviewer = await requireReviewerApi();
    const { id } = await ctx.params;
    const body = await jsonBody(request, bodySchema);
    const assessment = await reviewImpactCandidate(id, body.candidateId, body.decision, reviewer, body.note);
    return ok({ assessment });
  });
