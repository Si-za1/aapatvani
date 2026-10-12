import { z } from "zod";
import { fail, handle, jsonBody, ok } from "@/lib/api";
import { assertSameOrigin, requireReviewerApi } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { decideMembership, placeReport } from "@/lib/review/service";

const bodySchema = z.union([
  z.object({ reportId: z.string(), decision: z.enum(["confirmed", "rejected"]), note: z.string().max(1_000).optional() }),
  z.object({ reportId: z.string(), moveToIncidentId: z.string().nullable(), note: z.string().max(1_000).optional() }),
]);

/**
 * The reviewer's override on membership: confirm or reject one report's place here, or move it to
 * another incident (or out of every incident) by hand.
 */
export const POST = (request: Request, ctx: RouteContext<"/api/incidents/[id]/members">) =>
  handle(async () => {
    assertSameOrigin(request);
    const reviewer = await requireReviewerApi();
    const { id } = await ctx.params;
    const body = await jsonBody(request, bodySchema);

    if ("moveToIncidentId" in body) {
      const incident = await placeReport(body.reportId, body.moveToIncidentId, reviewer, body.note);
      return ok({ incident });
    }

    const report = await getDb().reports.get(body.reportId);
    if (!report) return fail(404, "That report does not exist.");
    const incident = await decideMembership(id, body.reportId, body.decision, reviewer, body.note);
    return ok({ incident });
  });
