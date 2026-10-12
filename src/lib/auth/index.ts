import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { Actor } from "@/lib/domain/schemas";
import { SESSION_COOKIE, verifySessionToken, type Reviewer } from "./session";

export type { Reviewer } from "./session";

/**
 * The signed-in reviewer, or null.
 *
 * Reading the session is request-time work twice over: it depends on a cookie, and it compares the
 * token's expiry against the current time. Saying so explicitly stops Next.js from attempting to
 * prerender a page that contains it — without this the clock read inside session verification is
 * reported as an unstable value during prerendering and the render is thrown away.
 */
export async function getReviewer(): Promise<Reviewer | null> {
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

/** For pages: redirects to the sign-in page when there is no valid reviewer session. */
export async function requireReviewer(next?: string): Promise<Reviewer> {
  const reviewer = await getReviewer();
  if (!reviewer) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return reviewer;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** For route handlers: throws HttpError(401) when there is no valid reviewer session. */
export async function requireReviewerApi(): Promise<Reviewer> {
  const reviewer = await getReviewer();
  if (!reviewer) throw new HttpError(401, "Sign in as a reviewer to do this.");
  return reviewer;
}

/** Rejects cross-site browser requests to state-changing endpoints. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "Cross-origin request rejected.");
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(403, "Invalid origin.");
  }
}

export function reviewerActor(reviewer: Reviewer): Actor {
  return { kind: "human", id: reviewer.id, name: reviewer.name };
}
