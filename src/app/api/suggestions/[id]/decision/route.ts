import { z } from "zod";
import { handle, jsonBody, ok } from "@/lib/api";
import { assertSameOrigin, requireReviewerApi } from "@/lib/auth";
import { decideSuggestion } from "@/lib/review/service";

const bodySchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
  note: z.string().max(1_000).optional(),
});

/**
 * The reviewer's decision on a suggested match (feature M6). This is the only way two reports end
 * up in one incident: neither the score nor the model's verdict can do it on their own.
 */
export const POST = (request: Request, ctx: RouteContext<"/api/suggestions/[id]/decision">) =>
  handle(async () => {
    assertSameOrigin(request);
    const reviewer = await requireReviewerApi();
    const { id } = await ctx.params;
    const body = await jsonBody(request, bodySchema);
    const { suggestion, incident } = await decideSuggestion(id, body, reviewer);
    return ok({ suggestion, incident });
  });
