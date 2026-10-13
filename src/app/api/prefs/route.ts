import { z } from "zod";
import { handle, jsonBody, ok } from "@/lib/api";
import { assertSameOrigin, requireReviewerApi, reviewerActor } from "@/lib/auth";
import { parsePrefs } from "@/lib/pref-choices";
import { PREFS_COOKIE } from "@/lib/prefs";
import { recordAudit } from "@/lib/audit";

// A reviewer's own preferences. Kept in a cookie rather than the store: they describe how someone
// likes to start their shift, not anything about the data, and nothing on this page changes what a
// reviewer may see or do.

const bodySchema = z.object({
  windowHours: z.number().int().min(0).max(24 * 30),
  queue: z.enum(["awaiting", "unread", "all"]),
});

export const POST = (request: Request) =>
  handle(async () => {
    assertSameOrigin(request);
    const reviewer = await requireReviewerApi();
    const body = await jsonBody(request, bodySchema);

    // Parsed through the same reader the pages use, so what is written is what will be read back.
    const prefs = parsePrefs(JSON.stringify(body));

    const response = ok({ prefs });
    response.cookies.set(PREFS_COOKIE, JSON.stringify(prefs), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });

    await recordAudit({
      actor: reviewerActor(reviewer),
      action: "prefs.updated",
      targetType: "session",
      targetId: reviewer.id,
      summary: `${reviewer.name} changed their workspace preferences.`,
    });

    return response;
  });
