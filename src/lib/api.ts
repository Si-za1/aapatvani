import "server-only";

// Shared helpers for route handlers: one place that turns our error types into HTTP responses, so
// every route reports failures the same way and never leaks an internal message to the public.

import { NextResponse, connection } from "next/server";
import { z } from "zod";
import { AiCallError, AiOutputError, AiUnavailableError } from "@/lib/ai/types";
import { AlertNotReadyError } from "@/lib/alerts/service";
import { HttpError } from "@/lib/auth";
import { SubmissionError } from "@/lib/reports/service";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as object, { status });
}

export function fail(status: number, message: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Runs a route body and maps known failures onto status codes:
 *   400 malformed input · 401 not signed in · 403 cross-origin · 404 missing · 409 conflict
 *   413 too large · 429 rate limited · 503 Gemini unavailable · 502 the model call failed · 500 anything else
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  // Every handler reads the session or the store, so none of them can be prerendered. Saying so
  // here stops Next.js before it tries: without this, prerendering calls cookies() and the failure
  // is caught below as if it were an application error.
  await connection();
  try {
    return await fn();
  } catch (err) {
    // Next's control-flow signals (prerender bailouts) carry a digest and must not become a 500.
    if (err && typeof err === "object" && "digest" in err) throw err;
    if (err instanceof HttpError) return fail(err.status, err.message);
    if (err instanceof SubmissionError) return fail(400, err.message);
    if (err instanceof AlertNotReadyError) return fail(409, err.message);
    if (err instanceof AiUnavailableError) {
      return fail(503, "Gemini is not configured on this deployment, so this step cannot run yet.");
    }
    if (err instanceof AiCallError || err instanceof AiOutputError) {
      return fail(502, `The model call failed: ${err.message}`);
    }
    if (err instanceof z.ZodError) {
      return fail(400, err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
    }
    if (err instanceof Error && /not found/i.test(err.message)) return fail(404, err.message);
    console.error("Unhandled API error", err);
    return fail(500, "Something went wrong on the server.");
  }
}

/** Parses and validates a JSON body. Throws ZodError, which `handle` turns into a 400. */
export async function jsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, "Expected a JSON body.");
  }
  return schema.parse(raw);
}

/** Reads the sign-in redirect target without letting it become an open redirect. */
export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}
