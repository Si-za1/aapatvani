import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { HttpError, assertSameOrigin, requireReviewerApi } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { ReportStatus } from "@/lib/domain/schemas";
import { getEnv } from "@/lib/env";
import { newId } from "@/lib/ids";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import {
  MAX_UPLOAD_BYTES,
  REPORTER_COOKIE,
  createReport,
} from "@/lib/reports/service";

export const POST = (request: NextRequest) =>
  handle(async () => {
    assertSameOrigin(request);

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_UPLOAD_BYTES) {
      throw new HttpError(413, "That upload is too large. Send up to four photos or voice notes of 8 MB each.");
    }

    const env = getEnv();
    const limit = rateLimit(`report:${clientKey(request)}`, env.rateLimitPerTenMinutes, 10 * 60 * 1000);
    if (!limit.ok) {
      throw new HttpError(429, `Too many reports from this connection. Try again in ${limit.retryAfterS} seconds.`);
    }

    const form = await request.formData();
    const jar = await cookies();
    const reporterToken = jar.get(REPORTER_COOKIE)?.value ?? newId("rt");

    const { report, submitToken } = await createReport(form, reporterToken);

    const response = ok(
      {
        id: report.id,
        referenceCode: report.referenceCode,
        submittedAt: report.submittedAt,
        status: report.status,
        // The browser keeps this so it, and only it, can ask for extraction.
        submitToken,
      },
      201,
    );
    response.cookies.set(REPORTER_COOKIE, reporterToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProduction,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    return response;
  });

export const GET = (request: NextRequest) =>
  handle(async () => {
    await requireReviewerApi();
    const db = getDb();
    const params = request.nextUrl.searchParams;
    const status = params.getAll("status") as ReportStatus[];
    const limit = Math.min(Number(params.get("limit") ?? 100) || 100, 500);

    let reports = await db.reports.list({ orderBy: { field: "submittedAt", direction: "desc" } });
    if (status.length) reports = reports.filter((r) => status.includes(r.status));
    const hazard = params.get("hazard");
    if (hazard) reports = reports.filter((r) => r.reporterHazard === hazard);

    return ok({
      reports: reports.slice(0, limit),
      total: reports.length,
    });
  });
