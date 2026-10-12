import { z } from "zod";
import { handle, jsonBody, ok } from "@/lib/api";
import { assertSameOrigin, requireReviewerApi } from "@/lib/auth";
import { setIncidentStatus } from "@/lib/incidents/service";

const bodySchema = z.object({
  status: z.enum(["candidate", "under_review", "verified", "dismissed"]),
  note: z.string().max(1_000).optional(),
});

/**
 * Settles the grouping. "Verified" means a reviewer has checked that these reports describe one
 * event, and it is what marks every member's membership as confirmed.
 */
export const POST = (request: Request, ctx: RouteContext<"/api/incidents/[id]/status">) =>
  handle(async () => {
    assertSameOrigin(request);
    const reviewer = await requireReviewerApi();
    const { id } = await ctx.params;
    const body = await jsonBody(request, bodySchema);
    const incident = await setIncidentStatus(id, body.status, reviewer, body.note);
    return ok({ incident });
  });
