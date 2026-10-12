import { handle, ok } from "@/lib/api";
import { HttpError, requireReviewerApi } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { reportBundle } from "@/lib/reports/service";

/** Everything a reviewer needs for one report: the original, the extraction and the claims. */
export const GET = (_request: Request, ctx: RouteContext<"/api/reports/[id]">) =>
  handle(async () => {
    await requireReviewerApi();
    const { id } = await ctx.params;
    const bundle = await reportBundle(id);
    if (!bundle) throw new HttpError(404, "That report does not exist.");

    const db = getDb();
    const incident = bundle.report.incidentId ? await db.incidents.get(bundle.report.incidentId) : null;
    const suggestions = await db.suggestions.list({ where: [{ field: "reportIds", op: "array-contains", value: id }] });

    return ok({
      ...bundle,
      incident,
      suggestions,
    });
  });
