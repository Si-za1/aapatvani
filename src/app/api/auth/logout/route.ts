import { handle, ok } from "@/lib/api";
import { recordAudit, humanActor } from "@/lib/audit";
import { assertSameOrigin, getReviewer } from "@/lib/auth";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export const POST = (request: Request) =>
  handle(async () => {
    assertSameOrigin(request);
    const reviewer = await getReviewer();
    const response = ok({ signedOut: true });
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    if (reviewer) {
      await recordAudit({
        actor: humanActor(reviewer.id, reviewer.name),
        action: "session.ended",
        targetType: "session",
        targetId: reviewer.id,
        summary: `${reviewer.name} signed out.`,
      });
    }
    return response;
  });
