import { z } from "zod";
import { handle, jsonBody, ok } from "@/lib/api";
import { assertSameOrigin, requireReviewerApi } from "@/lib/auth";
import { decideContradiction } from "@/lib/review/service";

const bodySchema = z.object({
  decision: z.enum(["resolved", "dismissed"]),
  note: z.string().max(1_000).optional(),
});

/**
 * Resolves or dismisses a flagged contradiction (feature M8). A resolved or dismissed flag stops
 * counting against the incident, and re-running matching will not re-open it.
 */
export const POST = (request: Request, ctx: RouteContext<"/api/contradictions/[id]/decision">) =>
  handle(async () => {
    assertSameOrigin(request);
    const reviewer = await requireReviewerApi();
    const { id } = await ctx.params;
    const body = await jsonBody(request, bodySchema);
    const contradiction = await decideContradiction(id, body, reviewer);
    return ok({ contradiction });
  });
