import { z } from "zod";
import { handle, jsonBody, ok } from "@/lib/api";
import { assertSameOrigin, requireReviewerApi } from "@/lib/auth";
import { reviewClaim } from "@/lib/review/service";

const bodySchema = z.object({
  status: z.enum(["unreviewed", "confirmed", "edited", "rejected", "needs_info"]),
  note: z.string().max(1_000).optional(),
  editedStatement: z.string().max(2_000).optional(),
});

/** Confirms, edits, rejects or asks for more information on one claim (feature M4). */
export const POST = (request: Request, ctx: RouteContext<"/api/claims/[id]/review">) =>
  handle(async () => {
    assertSameOrigin(request);
    const reviewer = await requireReviewerApi();
    const { id } = await ctx.params;
    const body = await jsonBody(request, bodySchema);
    const claim = await reviewClaim(id, body, reviewer);
    return ok({ claim });
  });
