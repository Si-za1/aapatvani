import { fail, handle, ok } from "@/lib/api";
import { reportBundle, submitTokenMatches } from "@/lib/reports/service";

/**
 * The reporter's own view of their report, behind the submit token they were given.
 *
 * It is a different view from the reviewer's, not a filtered one: no reviewer notes, no incident
 * grouping, no other reports, no one else's claims. The token travels in a header rather than the
 * query string so it does not end up in access logs or a Referer header.
 */
export const GET = (request: Request, ctx: RouteContext<"/api/reports/[id]/receipt">) =>
  handle(async () => {
    const { id } = await ctx.params;
    const token = request.headers.get("x-submit-token");
    const bundle = await reportBundle(id);
    if (!bundle) return fail(404, "That report does not exist.");
    if (!submitTokenMatches(bundle.report, token)) {
      return fail(403, "We could not confirm that this device sent that report.");
    }

    const claims = bundle.claims
      .filter((claim) => claim.review.status !== "rejected")
      .map((claim) => ({
        id: claim.id,
        // Only the plain statement, never the reviewer's private notes.
        statement: claim.statement,
        statementEn: claim.statementEn,
        origin: claim.origin,
        verified: claim.excerpt?.verified ?? false,
      }));

    return ok({
      report: {
        id: bundle.report.id,
        referenceCode: bundle.report.referenceCode,
        text: bundle.report.text,
        uiLanguage: bundle.report.uiLanguage,
        submittedAt: bundle.report.submittedAt,
        status: bundle.report.status,
        statusDetail: bundle.report.statusDetail,
        media: bundle.report.media.map((item) => ({ id: item.id, kind: item.kind, mimeType: item.mimeType })),
      },
      claims,
      transcript: bundle.extraction?.transcript?.text,
      missingInformation: bundle.extraction?.missingInformation ?? [],
      aiAvailable: bundle.report.status !== "ai_unavailable",
    });
  });
