import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

// End-to-end through the HTTP route handlers on the local store, the gate for this chunk.
// Every call below goes through a real route handler: validation, the session check, the service
// layer and the file-backed store. Only `next/headers` is faked, because cookies need a request
// context that a unit test does not have.

const cookieJar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
}));

// Route handlers call connection() to opt out of prerendering. These tests invoke them directly,
// outside any Next.js request scope, so there is nothing to opt out of.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

process.env.DATA_BACKEND = "local";
process.env.LOCAL_DATA_DIR = mkdtempSync(path.join(tmpdir(), "av-api-"));
process.env.AUTH_MODE = "passcode";
process.env.REVIEWER_PASSCODE = "test-passcode";
process.env.SESSION_SECRET = "test-session-secret-that-is-long-enough";
process.env.DEFAULT_REGION = "np";

const { POST: login } = await import("@/app/api/auth/login/route");
const { POST: logout } = await import("@/app/api/auth/logout/route");
const { POST: submitReport, GET: listReports } = await import("@/app/api/reports/route");
const { GET: getReport } = await import("@/app/api/reports/[id]/route");
const { POST: runMatch } = await import("@/app/api/reports/[id]/match/route");
const { GET: listIncidents } = await import("@/app/api/incidents/route");
const { GET: getIncident } = await import("@/app/api/incidents/[id]/route");
const { POST: setStatus } = await import("@/app/api/incidents/[id]/status/route");
const { POST: runImpact } = await import("@/app/api/incidents/[id]/impact/route");
const { POST: decideCandidate } = await import("@/app/api/impacts/[id]/candidates/route");
const { POST: draftAlert } = await import("@/app/api/incidents/[id]/alert/route");
const { POST: reviewClaim } = await import("@/app/api/claims/[id]/review/route");
const { POST: decideSuggestion } = await import("@/app/api/suggestions/[id]/decision/route");
const { GET: getMedia } = await import("@/app/api/media/[reportId]/[mediaId]/route");
const { GET: getReceipt } = await import("@/app/api/reports/[id]/receipt/route");

const { getDb } = await import("@/lib/db");

const LARCHA = { lat: 27.93309, lng: 85.93534 };

// A real request always carries a host header; assertSameOrigin compares it with the Origin.
const json = (body: unknown, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api", {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: "localhost:3000" },
    body: JSON.stringify(body),
  });

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** Signs in and puts the issued session cookie into the jar, exactly as a browser would. */
async function signIn(passcode = "test-passcode"): Promise<Response> {
  const response = await login(json({ mode: "passcode", passcode, name: "Test Reviewer" }) as never);
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookieJar.set("av_session", setCookie.split(";")[0].split("=").slice(1).join("="));
  return response;
}

let reportId = "";
let secondReportId = "";
let submitToken = "";
let claimId = "";
let incidentId = "";
let suggestionId = "";
let impactAssessmentId = "";

beforeAll(async () => {
  const response = await signIn();
  expect(response.status).toBe(200);
});

describe("auth", () => {
  it("refuses reviewer routes without a session", async () => {
    const saved = cookieJar.get("av_session");
    cookieJar.delete("av_session");
    const response = await listIncidents(new NextRequest("http://localhost:3000/api/incidents") as never);
    expect(response.status).toBe(401);
    cookieJar.set("av_session", saved!);
  });

  it("rejects a wrong passcode and accepts the right one", async () => {
    expect((await signIn("not-the-passcode")).status).toBe(401);
    expect((await signIn()).status).toBe(200);
  });

  it("rejects a state-changing request from another origin", async () => {
    const response = await runMatch(json({}, "https://evil.example") as never, ctx({ id: "rep_x" }));
    expect(response.status).toBe(403);
  });

  it("signs out and clears the cookie", async () => {
    const response = await logout(json({}) as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/av_session=;/);
    await signIn();
  });
});

describe("public intake", () => {
  it("accepts a report with a photo and returns a reference code", async () => {
    const form = new FormData();
    form.set("text", "लार्चा नजिक अरनिको राजमार्गमा पहिरो खस्यो। बाटो बन्द छ।");
    form.set("uiLanguage", "ne");
    form.set("reporterHazard", "landslide");
    form.set("locationSource", "gps");
    form.set("lat", String(LARCHA.lat));
    form.set("lng", String(LARCHA.lng));
    form.set("accuracyM", "25");
    form.set("timeHint", "earlier_today");
    form.set("media", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "photo.png", { type: "image/png" }));

    const response = await submitReport(
      new Request("http://localhost:3000/api/reports", { method: "POST", body: form, headers: { origin: "http://localhost:3000", host: "localhost:3000" } }) as never,
    );
    const body = await readJson<{ id: string; referenceCode: string; submitToken: string }>(response);

    expect(response.status).toBe(201);
    expect(body.referenceCode).toMatch(/^AV-/);
    expect(body.submitToken).toBeTruthy();
    reportId = body.id;
    submitToken = body.submitToken;

    const stored = await getDb().reports.get(reportId);
    expect(stored?.status).toBe("received");
    expect(stored?.media[0].sha256).toHaveLength(64);
    // No coordinates are invented, and no personal data is required.
    expect(stored?.reporterToken).toMatch(/^rt_/);
  });

  it("rejects a submission with neither text nor media", async () => {
    const form = new FormData();
    form.set("text", "   ");
    form.set("locationSource", "none");
    const response = await submitReport(
      new Request("http://localhost:3000/api/reports", { method: "POST", body: form, headers: { origin: "http://localhost:3000", host: "localhost:3000" } }) as never,
    );
    expect(response.status).toBe(400);
  });

  it("rejects coordinates that do not match the stated location source", async () => {
    const form = new FormData();
    form.set("text", "Something happened");
    form.set("locationSource", "place_name");
    form.set("lat", "27.9");
    form.set("lng", "85.9");
    const response = await submitReport(
      new Request("http://localhost:3000/api/reports", { method: "POST", body: form, headers: { origin: "http://localhost:3000", host: "localhost:3000" } }) as never,
    );
    expect(response.status).toBe(400);
  });

  it("lists reports for a reviewer", async () => {
    const response = await listReports(new NextRequest("http://localhost:3000/api/reports") as never);
    const body = await readJson<{ reports: unknown[]; total: number }>(response);
    expect(response.status).toBe(200);
    expect(body.total).toBeGreaterThan(0);
  });

  it("accepts a second report near the first, so matching has something to compare", async () => {
    const form = new FormData();
    form.set("text", "A landslide covered the Arniko Highway near Larcha this morning; the road to Tatopani is blocked.");
    form.set("uiLanguage", "en");
    form.set("reporterHazard", "landslide");
    form.set("locationSource", "gps");
    form.set("lat", "27.9385");
    form.set("lng", "85.9418");
    form.set("accuracyM", "40");

    const response = await submitReport(
      new Request("http://localhost:3000/api/reports", { method: "POST", body: form, headers: { origin: "http://localhost:3000", host: "localhost:3000" } }) as never,
    );
    const body = await readJson<{ id: string }>(response);
    expect(response.status).toBe(201);
    secondReportId = body.id;
  });
});

describe("review workflow", () => {
  it("runs matching, which opens a candidate incident", async () => {
    const response = await runMatch(json({ rulesOnly: true }) as never, ctx({ id: reportId }));
    const body = await readJson<{ incident: { id: string; status: string }; suggestions: unknown[] }>(response);

    expect(response.status).toBe(200);
    expect(body.incident.status).toBe("candidate");
    incidentId = body.incident.id;
  });

  it("returns the report with its original text and its claims", async () => {
    const response = await getReport(new NextRequest("http://localhost:3000/api/reports") as never, ctx({ id: reportId }));
    const body = await readJson<{ report: { text: string }; claims: Array<{ id: string }> }>(response);

    expect(response.status).toBe(200);
    expect(body.report.text).toContain("पहिरो");
    expect(body.claims).toHaveLength(0);
  });

  it("shows the incident workspace with its members and analysis state", async () => {
    const response = await getIncident(new NextRequest("http://localhost:3000/api/incidents") as never, ctx({ id: incidentId }));
    const body = await readJson<{ incident: { id: string }; reports: unknown[]; assessment: null }>(response);

    expect(response.status).toBe(200);
    expect(body.reports).toHaveLength(1);
    expect(body.assessment).toBeNull();
  });

  it("gives the dashboard its counts", async () => {
    const response = await listIncidents(new NextRequest("http://localhost:3000/api/incidents") as never);
    const body = await readJson<{ incidents: unknown[]; stats: { reports: number; awaitingReview: number } }>(response);

    expect(response.status).toBe(200);
    expect(body.stats.reports).toBeGreaterThan(0);
  });

  it("returns 404 for a report that does not exist", async () => {
    const response = await getReport(new NextRequest("http://localhost:3000/api/reports") as never, ctx({ id: "rep_nope" }));
    expect(response.status).toBe(404);
  });

  it("links the second report to a candidate suggestion with a score breakdown", async () => {
    await runMatch(json({ rulesOnly: true }) as never, ctx({ id: secondReportId }));

    const db = getDb();
    const suggestions = await db.suggestions.list({ where: [{ field: "regionId", op: "==", value: "np" }] });
    const pair = suggestions.find((s) => s.reportIds.includes(reportId) && s.reportIds.includes(secondReportId));

    expect(pair).toBeDefined();
    expect(pair!.score).toBeGreaterThan(0);
    expect(pair!.features.hazardMatch).toBe("same");
    suggestionId = pair!.id;
  });

  it("lets a reviewer confirm a claim, recording who decided it", async () => {
    const db = getDb();
    // Seeded directly: extraction needs Gemini, which this deployment does not have configured.
    const claim = await db.claims.create({
      id: "clm_e2e_1",
      reportId,
      extractionId: "ext_e2e",
      regionId: "np",
      type: "impact_road",
      statement: "बाटो बन्द छ",
      statementEn: "The road is blocked",
      origin: "reporter",
      basis: "report_text",
      roadStatus: "blocked",
      roadName: "Arniko Highway",
      review: { status: "unreviewed" },
      createdAt: "2026-07-14T01:31:00.000Z",
    });
    claimId = claim.id;

    const response = await reviewClaim(json({ status: "confirmed", note: "Matches the photo." }) as never, ctx({ id: claimId }));
    const body = await readJson<{ claim: { review: { status: string; by?: { name: string } } } }>(response);

    expect(response.status).toBe(200);
    expect(body.claim.review.status).toBe("confirmed");
    expect(body.claim.review.by?.name).toBe("Test Reviewer");
  });

  it("groups provisionally, and confirms only when a reviewer accepts", async () => {
    const db = getDb();
    const before = await db.reports.get(reportId);
    const other = await db.reports.get(secondReportId);

    // The system has already proposed one incident: same event, and matching is allowed to group.
    expect(before!.incidentId).toBe(other!.incidentId);
    const candidate = await db.incidents.get(before!.incidentId!);
    expect(candidate!.status).toBe("candidate");
    // ...but every membership is still only a suggestion.
    expect(candidate!.members.every((m) => m.membership === "suggested")).toBe(true);

    const response = await decideSuggestion(json({ decision: "accepted", note: "Same landslide." }) as never, ctx({ id: suggestionId }));
    const body = await readJson<{ suggestion: { status: string; decidedBy?: string }; incident: { id: string; reportIds: string[]; members: Array<{ membership: string }> } }>(response);

    expect(response.status).toBe(200);
    expect(body.suggestion.status).toBe("accepted");
    expect(body.suggestion.decidedBy).toBeTruthy();
    expect(body.incident.reportIds).toContain(reportId);
    expect(body.incident.reportIds).toContain(secondReportId);
    expect(body.incident.members.every((m) => m.membership === "confirmed")).toBe(true);
    incidentId = body.incident.id;
  });

  it("rejects an unknown claim with a 404 rather than a silent success", async () => {
    const response = await reviewClaim(json({ status: "confirmed" }) as never, ctx({ id: "clm_nope" }));
    expect(response.status).toBe(404);
  });
});

describe("the reporter's own receipt", () => {
  const receiptRequest = (token?: string) =>
    new NextRequest(`http://localhost:3000/api/reports/${reportId}/receipt`, {
      headers: token ? { "x-submit-token": token } : {},
    }) as never;

  it("is readable by the browser that sent the report", async () => {
    const response = await getReceipt(receiptRequest(submitToken), ctx({ id: reportId }));
    const body = await readJson<{ report: { referenceCode: string; text: string }; claims: unknown[]; aiAvailable: boolean }>(response);

    expect(response.status).toBe(200);
    expect(body.report.referenceCode).toMatch(/^AV-/);
    expect(body.report.text).toContain("पहिरो");
  });

  it("refuses a request with no token, or the wrong one", async () => {
    expect((await getReceipt(receiptRequest(), ctx({ id: reportId }))).status).toBe(403);
    expect((await getReceipt(receiptRequest("not-the-token"), ctx({ id: reportId }))).status).toBe(403);
  });

  it("shows the reporter nothing that belongs to the reviewer", async () => {
    // The receipt is a different view, not the reviewer's view with fields hidden. A public page
    // must never carry incident grouping, reviewer identity, similarity scores or a submit hash.
    const response = await getReceipt(receiptRequest(submitToken), ctx({ id: reportId }));
    const raw = await response.text();

    expect(raw).not.toContain("incidentId");
    expect(raw).not.toContain("submitTokenHash");
    expect(raw).not.toContain("reporterToken");
    expect(raw).not.toMatch(/similarity|score/i);
    const body = JSON.parse(raw) as { report: Record<string, unknown>; claims: unknown[] };
    expect(Object.keys(body.report)).toEqual(
      expect.not.arrayContaining(["incidentId", "reporterToken", "submitTokenHash", "scenario"]),
    );
    // Claims carry only the plain statement, never the reviewer's private note.
    const claims = body.claims as Array<Record<string, unknown>>;
    for (const claim of claims) expect(claim).not.toHaveProperty("review");
  });

  it("does not accept a reviewer session in place of the token", async () => {
    // A signed-in reviewer reads the report through /api/reports/[id]. The receipt is the
    // reporter's door, and it opens only with the token they were given.
    expect((await getReceipt(receiptRequest(), ctx({ id: reportId }))).status).toBe(403);
  });
});

describe("impact and alerts", () => {
  it("runs the blast radius against the real corridor dataset", async () => {
    const response = await runImpact(json({ withExplanation: false }) as never, ctx({ id: incidentId }));
    const body = await readJson<{ assessment: { id: string; status: string; statusMessage: string; limitations: string[]; blockedRoads: unknown[]; candidates: unknown[] } }>(response);

    expect(response.status).toBe(201);
    expect(body.assessment.id).toBeTruthy();
    // A location inside the dataset, so the analysis ran rather than abstaining.
    expect(["ok", "no_road_nearby", "proximity_only"]).toContain(body.assessment.status);
    // The "not necessarily safe" line is always present.
    expect(body.assessment.limitations.join(" ")).toMatch(/not necessarily safe/);
    impactAssessmentId = body.assessment.id;
  });

  it("finds the blocked highway and the places that depend on it", async () => {
    const db = getDb();
    const assessment = await db.impacts.get(impactAssessmentId);
    // The confirmed claim says the Arniko Highway is blocked, so a segment must have been assumed.
    expect(assessment!.blockedRoads.length).toBeGreaterThan(0);
    expect(assessment!.status).toBe("ok");
    expect(assessment!.candidates.length).toBeGreaterThan(0);
    // Explanations are deterministic sentences, and every candidate says what it rests on.
    for (const candidate of assessment!.candidates.slice(0, 5)) {
      expect(candidate.explanation.length).toBeGreaterThan(10);
      expect(Array.isArray(candidate.caveats)).toBe(true);
    }
  });

  it("records a reviewer's decision on an impact candidate", async () => {
    const db = getDb();
    const assessment = await db.impacts.get(impactAssessmentId);
    const candidate = assessment!.candidates[0];
    expect(candidate).toBeDefined();

    const response = await decideCandidate(
      json({ candidateId: candidate.id, decision: "confirmed", note: "Checked with the ward office." }) as never,
      ctx({ id: impactAssessmentId }),
    );
    const body = await readJson<{ assessment: { candidates: Array<{ id: string; review: { status: string; by?: { name: string } } }> } }>(response);

    expect(response.status).toBe(200);
    const stored = body.assessment.candidates.find((c) => c.id === candidate.id);
    expect(stored?.review.status).toBe("confirmed");
    expect(stored?.review.by?.name).toBe("Test Reviewer");
  });

  it("stores a dismissal as a rejection, keeping the finding for the record", async () => {
    const db = getDb();
    const assessment = await db.impacts.get(impactAssessmentId);
    const candidate = assessment!.candidates[1];
    expect(candidate).toBeDefined();

    const response = await decideCandidate(json({ candidateId: candidate.id, decision: "dismissed" }) as never, ctx({ id: impactAssessmentId }));
    const body = await readJson<{ assessment: { candidates: Array<{ id: string; review: { status: string } }> } }>(response);
    const stored = body.assessment.candidates.find((c) => c.id === candidate.id);

    expect(stored?.review.status).toBe("rejected");
    expect(stored).toBeDefined();
  });

  it("will not draft an alert for an incident with no confirmed claims", async () => {
    // A report far away on its own: no confirmed claims, so there is nothing to cite.
    const form = new FormData();
    form.set("text", "बाढीले खेत डुबानमा परेको छ।");
    form.set("uiLanguage", "ne");
    form.set("reporterHazard", "flood");
    form.set("locationSource", "gps");
    form.set("lat", "27.75");
    form.set("lng", "85.75");
    const submitted = await submitReport(
      new Request("http://localhost:3000/api/reports", { method: "POST", body: form, headers: { origin: "http://localhost:3000", host: "localhost:3000" } }) as never,
    );
    const { id } = await readJson<{ id: string }>(submitted);
    const matched = await runMatch(json({ rulesOnly: true }) as never, ctx({ id }));
    const { incident } = await readJson<{ incident: { id: string } }>(matched);

    const response = await draftAlert(json({ languages: ["en"] }) as never, ctx({ id: incident.id }));
    expect(response.status).toBe(409);
    const body = await readJson<{ error: string }>(response);
    expect(body.error).toMatch(/Confirm at least one claim/);
  });

  it("reports honestly that Gemini is not configured, instead of inventing a draft", async () => {
    const response = await draftAlert(json({ languages: ["en", "ne"] }) as never, ctx({ id: incidentId }));
    expect(response.status).toBe(503);
    const body = await readJson<{ error: string }>(response);
    expect(body.error).toMatch(/Gemini is not configured/);
  });

  it("settles the incident only when a reviewer says so", async () => {
    const response = await setStatus(json({ status: "verified", note: "Two independent reports agree." }) as never, ctx({ id: incidentId }));
    const body = await readJson<{ incident: { status: string; members: Array<{ membership: string }>; verification?: { byName: string } } }>(response);

    expect(response.status).toBe(200);
    expect(body.incident.status).toBe("verified");
    expect(body.incident.members.every((m) => m.membership === "confirmed")).toBe(true);
    expect(body.incident.verification?.byName).toBe("Test Reviewer");
  });

  it("serves private media to a signed-in reviewer only", async () => {
    const db = getDb();
    const report = await db.reports.get(reportId);
    const media = report!.media[0];

    const response = await getMedia(
      new NextRequest("http://localhost:3000/api/media") as never,
      ctx({ reportId, mediaId: media.id }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toMatch(/private/);

    const saved = cookieJar.get("av_session");
    cookieJar.delete("av_session");
    const unauthorised = await getMedia(
      new NextRequest("http://localhost:3000/api/media") as never,
      ctx({ reportId, mediaId: media.id }),
    );
    expect(unauthorised.status).toBe(401);
    cookieJar.set("av_session", saved!);
  });
});
