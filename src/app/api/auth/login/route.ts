import { z } from "zod";
import { fail, handle, jsonBody, ok } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth";
import {
  SESSION_COOKIE,
  checkPasscode,
  createFirebaseSession,
  createPasscodeSession,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth/session";
import { recordAudit, humanActor } from "@/lib/audit";
import { getEnv } from "@/lib/env";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.union([
  z.object({ mode: z.literal("passcode"), passcode: z.string().min(1).max(200), name: z.string().max(60).optional() }),
  z.object({ mode: z.literal("firebase"), idToken: z.string().min(1) }),
]);

/**
 * Reviewer sign-in. Firebase Authentication in production, a shared passcode when the deployment has
 * no Firebase project. Either way the reviewer ends up with the same signed session cookie.
 */
export const POST = (request: Request) =>
  handle(async () => {
    assertSameOrigin(request);
    const env = getEnv();
    const body = await jsonBody(request, bodySchema);

    // Guessing a passcode is slow, not free.
    const limit = rateLimit(`login:${clientKey(request)}`, 10, 5 * 60 * 1000);
    if (!limit.ok) return fail(429, `Too many sign-in attempts. Try again in ${limit.retryAfterS} seconds.`);

    if (body.mode === "firebase") {
      if (env.authMode !== "firebase") return fail(400, "This deployment signs reviewers in with a passcode.");
      const { cookie, reviewer } = await createFirebaseSession(body.idToken);
      const response = ok({ reviewer: { id: reviewer.id, name: reviewer.name, mode: reviewer.mode } });
      response.cookies.set(SESSION_COOKIE, cookie, sessionCookieOptions());
      await recordAudit({
        actor: humanActor(reviewer.id, reviewer.name),
        action: "session.started",
        targetType: "session",
        targetId: reviewer.id,
        summary: `${reviewer.name} signed in.`,
      });
      return response;
    }

    if (env.authMode === "firebase") return fail(400, "This deployment signs reviewers in with Firebase.");
    if (!checkPasscode(body.passcode)) return fail(401, "That passcode is not right.");

    const token = createPasscodeSession(body.name?.trim() || "Reviewer");
    const reviewer = await verifySessionToken(token);
    if (!reviewer) return fail(500, "The session could not be created. Check SESSION_SECRET.");

    const response = ok({ reviewer: { id: reviewer.id, name: reviewer.name, mode: reviewer.mode } });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    await recordAudit({
      actor: humanActor(reviewer.id, reviewer.name),
      action: "session.started",
      targetType: "session",
      targetId: reviewer.id,
      summary: `${reviewer.name} signed in with the local passcode.`,
    });
    return response;
  });
