import { z } from "zod";
import { handle, jsonBody, ok } from "@/lib/api";
import { assertSameOrigin, requireReviewerApi } from "@/lib/auth";
import { decideAlert } from "@/lib/alerts/service";

const bodySchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(1_000).optional(),
});

/**
 * Approves or rejects an alert draft. Approval records a named person's sign-off; there is no path
 * from here to sending anything, by design.
 */
export const POST = (request: Request, ctx: RouteContext<"/api/alerts/[id]/decision">) =>
  handle(async () => {
    assertSameOrigin(request);
    const reviewer = await requireReviewerApi();
    const { id } = await ctx.params;
    const body = await jsonBody(request, bodySchema);
    const draft = await decideAlert(id, body.decision, reviewer, body.note);
    return ok({ draft });
  });
