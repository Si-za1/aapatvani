import { handle, ok } from "@/lib/api";
import { assertSameOrigin, requireReviewerApi } from "@/lib/auth";
import { SEEN_COOKIE } from "@/lib/notifications";

// Marks the bell as read. The reading position is a cookie, so this writes the moment of reading
// and nothing else: there is no notification record to update, because the audit trail is the
// record and it never changes.

export const POST = (request: Request) =>
  handle(async () => {
    assertSameOrigin(request);
    await requireReviewerApi();

    const response = ok({ seen: true });
    response.cookies.set(SEEN_COOKIE, new Date().toISOString(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  });
