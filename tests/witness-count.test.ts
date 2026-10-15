import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import type { Claim, Extraction, Report } from "@/lib/domain/schemas";
import { runMatchingForReport } from "@/lib/matching/service";
import { makeClaim, makeReport } from "./helpers/fixtures";

// The independent-source count is the one number this product asks a responder to trust — "three
// witnesses, one forwarded copy excluded". These tests pin the ways it was reachable with a wrong
// value, all of which the 225 tests around them passed straight through.

process.env.DATA_BACKEND = "local";
process.env.LOCAL_DATA_DIR = mkdtempSync(path.join(tmpdir(), "av-witness-"));
process.env.AUTH_MODE = "passcode";

// Two places far apart, so the tests share one store without matching across each other: every
// report is compared with every other in the region, and identical text in another test's fixtures
// would be a genuine copy of it.
const LARCHA = { lat: 27.93309, lng: 85.93534 };
const FAR = { lat: 27.75, lng: 85.75 };
const TEXT = "लार्चा नजिक अरनिको राजमार्गमा बिहान ठूलो पहिरो खस्यो। बाटो पूरै बन्द छ, सवारी अड्किएका छन्।";

const ids: Record<string, string> = {};

async function seed(key: string, report: Partial<Report>, embedding: number[], at = LARCHA): Promise<string> {
  const db = getDb();
  const id = `rep_${key}`;
  ids[key] = id;
  const extractionId = `ext_${key}`;
  await db.reports.create(
    makeReport({
      id,
      referenceCode: `AV-${key}`,
      latestExtractionId: extractionId,
      // A different device per report, so "same reporter" is never what flags them.
      reporterToken: `tok_${key}`,
      uiLanguage: "ne",
      reporterHazard: "landslide",
      location: { source: "gps", ...at, accuracyM: 30 },
      ...report,
    }) as Report,
  );
  const extraction: Extraction = {
    id: extractionId,
    reportId: id,
    createdAt: report.submittedAt ?? "2026-07-14T01:31:00.000Z",
    model: "test-model",
    promptVersion: "extract-v1",
    status: "ok",
    hazardCandidates: [],
    missingInformation: [],
    uncertaintyNotes: [],
    mediaNotes: [],
    claimIds: [],
    validation: { errors: [], warnings: [], droppedClaims: 0, unverifiedExcerpts: 0, citationsChecked: 0, citationsRejected: 0 },
    embedding,
  };
  await db.extractions.create(extraction);
  await db.claims.create(
    makeClaim({ id: `clm_${key}_0`, reportId: id, extractionId, type: "hazard", hazardCategory: "landslide" }) as Claim,
  );
  return id;
}

/** The one incident the two named reports ended up in. */
async function incidentOf(originalId: string, copyId: string) {
  const db = getDb();
  const incident = (await db.incidents.list({})).find((i) => i.reportIds.includes(originalId));
  expect(incident, `no incident holds ${originalId}`).toBeDefined();
  expect(incident!.reportIds).toContain(copyId);
  return incident!;
}

describe("independent source counting", () => {
  it("counts one witness when the copy is matched before its original", async () => {
    // The reported defect. `runMatchingForReport` writes the copy link from whichever side is being
    // matched, so when the ORIGINAL is matched second the link says "the other one is a copy of
    // this" — and the old code set copyOf unconditionally, marking the original as a copy of
    // itself. Both members then read as copies and the incident claimed ZERO independent sources
    // for one report and its forwarded copy.
    const original = await seed("OA", { text: TEXT, submittedAt: "2026-07-14T01:30:00.000Z" }, [0.5, 0.5]);
    const copy = await seed("CA", { text: TEXT, submittedAt: "2026-07-14T02:30:00.000Z" }, [0.5, 0.5]);

    // Extraction order, not submission order — which is what actually decides this in production.
    await runMatchingForReport(copy, null, { rulesOnly: true });
    await runMatchingForReport(original, null, { rulesOnly: true });

    const incident = await incidentOf(original, copy);
    expect(incident.members).toHaveLength(2);
    expect(incident.independentSources).toBe(1);

    for (const member of incident.members) {
      expect(member.copyOf, `${member.reportId} must not be a copy of itself`).not.toBe(member.reportId);
    }
    // The copy is the later submission, and it is the one that must carry the flag.
    expect(incident.members.find((m) => m.reportId === copy)?.copyOf).toBe(original);
  });

  it("counts one witness when the original is matched first, as before", async () => {
    // The ordinary ordering, which the old code did handle. Kept so the fix above cannot have
    // quietly changed the case that already worked.
    const original = await seed("OB", { text: TEXT, submittedAt: "2026-07-14T01:30:00.000Z" }, [0.5, 0.5], FAR);
    const copy = await seed("CB", { text: TEXT, submittedAt: "2026-07-14T02:30:00.000Z" }, [0.5, 0.5], FAR);

    await runMatchingForReport(original, null, { rulesOnly: true });
    await runMatchingForReport(copy, null, { rulesOnly: true });

    const incident = await incidentOf(original, copy);
    expect(incident.independentSources).toBe(1);
    expect(incident.members.find((m) => m.reportId === copy)?.copyOf).toBe(original);
  });
});
