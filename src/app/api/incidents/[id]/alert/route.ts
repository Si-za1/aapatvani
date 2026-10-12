import { z } from "zod";
import { handle, jsonBody, ok } from "@/lib/api";
import { getLlm } from "@/lib/ai/gemini";
import { assertSameOrigin, requireReviewerApi } from "@/lib/auth";
import { draftAlertForIncident } from "@/lib/alerts/service";

const bodySchema = z.object({
  languages: z.array(z.enum(["en", "ne"])).min(1).default(["en", "ne"]),
});

/**
 * Drafts a cited situation summary from confirmed claims and confirmed impacts only (feature M11).
 * The result is a draft for a reviewer to approve; the app never sends it anywhere.
 */
export const POST = (request: Request, ctx: RouteContext<"/api/incidents/[id]/alert">) =>
  handle(async () => {
    assertSameOrigin(request);
    const reviewer = await requireReviewerApi();
    const { id } = await ctx.params;
    const body = await jsonBody(request, bodySchema);
    const draft = await draftAlertForIncident({ incidentId: id, reviewer, llm: getLlm(), languages: body.languages });
    return ok({ draft }, 201);
  });
