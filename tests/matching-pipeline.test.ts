import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { LlmRequest } from "@/lib/ai/types";
import { getDb } from "@/lib/db";
import type { Claim, Extraction, Report } from "@/lib/domain/schemas";
import { runMatchingForReport } from "@/lib/matching/service";
import { FakeLlm } from "./helpers/fake-llm";
import { makeClaim, makeReport } from "./helpers/fixtures";

// The demo scenario from project.md §12, run end to end on the local store: real corridor geography,
// synthetic reports. R1 and R2 describe the same blocked highway, R3 is a forwarded copy of R1,
// R4 contradicts them, R5 is a different hazard far away.

process.env.DATA_BACKEND = "local";
process.env.LOCAL_DATA_DIR = mkdtempSync(path.join(tmpdir(), "av-match-"));
process.env.AUTH_MODE = "passcode";

const LARCHA = { lat: 27.93309, lng: 85.93534 };
const TATOPANI = { lat: 27.9385, lng: 85.9418 };
const R1_TEXT =
  "लार्चा नजिक अरनिको राजमार्गमा बिहान ठूलो पहिरो खस्यो। बाटो पूरै बन्द छ। ३ जना घाइते भएका छन्।";
const R3_TEXT = R1_TEXT;
const R2_TEXT =
  "A big landslide came down on the highway near Larcha this morning. The road towards Tatopani is fully blocked and vehicles are stuck on both sides.";

const ids: Record<string, string> = {};

async function seed(
  key: string,
  report: Partial<Report>,
  claims: Array<Partial<Claim>>,
  embedding: number[],
): Promise<string> {
  const db = getDb();
  const id = `rep_${key}`;
  ids[key] = id;
  const extractionId = `ext_${key}`;
  await db.reports.create(
    // Each report comes from its own device: the anonymous token is per browser, so distinct here.
    makeReport({ id, referenceCode: `AV-${key}`, latestExtractionId: extractionId, reporterToken: `tok_${key}`, ...report }) as Report,
  );
  const extraction: Extraction = {
    id: extractionId,
    reportId: id,
    createdAt: "2026-07-14T01:31:00.000Z",
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
  for (const [index, claim] of claims.entries()) {
    await db.claims.create(
      makeClaim({ id: `clm_${key}_${index}`, reportId: id, extractionId, ...claim }) as Claim,
    );
  }
  return id;
}

beforeAll(async () => {
  await seed(
    "R1",
    {
      text: R1_TEXT,
      uiLanguage: "ne",
      reporterHazard: "landslide",
      location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng, accuracyM: 30 },
      submittedAt: "2026-07-14T01:30:00.000Z",
    },
    [
      { type: "hazard", hazardCategory: "landslide", statementEn: "A large landslide came down", statement: "पहिरो खस्यो" },
      { type: "impact_road", roadStatus: "blocked", roadName: "Arniko Highway", statementEn: "The road is completely blocked" },
      { type: "impact_people", people: { kind: "injured", count: 3 }, statementEn: "Three people are injured" },
    ],
    [1, 0, 0],
  );

  await seed(
    "R2",
    {
      text: R2_TEXT,
      uiLanguage: "en",
      reporterHazard: "landslide",
      location: { source: "pin", lat: TATOPANI.lat, lng: TATOPANI.lng },
      submittedAt: "2026-07-14T02:10:00.000Z",
    },
    [
      { type: "hazard", hazardCategory: "landslide", statementEn: "A big landslide came down" },
      { type: "impact_road", roadStatus: "blocked", roadName: "Araniko Rajmarg", statementEn: "The road is fully blocked" },
    ],
    [0.95, 0.05, 0],
  );

  await seed(
    "R3",
    {
      text: R3_TEXT,
      uiLanguage: "ne",
      reporterHazard: "landslide",
      location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng, accuracyM: 30 },
      submittedAt: "2026-07-14T03:20:00.000Z",
    },
    [{ type: "impact_road", roadStatus: "blocked", statementEn: "The road is completely blocked" }],
    [1, 0, 0],
  );

  await seed(
    "R4",
    {
      text: "Road is open, only small debris on the side near Larcha. Vehicles are passing normally.",
      uiLanguage: "en",
      reporterHazard: "landslide",
      location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng, accuracyM: 60 },
      submittedAt: "2026-07-14T03:45:00.000Z",
    },
    [{ type: "impact_road", roadStatus: "passable", statementEn: "The road is open" }],
    [0.5, 0.5, 0],
  );

  await seed(
    "R5",
    {
      text: "बाढीले खेत डुबानमा परेको छ। धेरै पानी आएको छ।",
      uiLanguage: "ne",
      reporterHazard: "flood",
      location: { source: "gps", lat: 27.75, lng: 85.75, accuracyM: 100 },
      submittedAt: "2026-07-14T04:00:00.000Z",
    },
    [{ type: "hazard", hazardCategory: "flood", statementEn: "Fields are flooded" }],
    [0, 0, 1],
  );
});

describe("matching pipeline on the local store", () => {
  it("groups the reports that describe one event and keeps the unrelated one apart", async () => {
    for (const key of ["R1", "R2", "R3", "R4", "R5"]) {
      await runMatchingForReport(ids[key], null, { rulesOnly: true });
    }

    const db = getDb();
    const incidentOf = async (key: string) => {
      const report = await db.reports.get(ids[key]);
      return report?.incidentId ? db.incidents.get(report.incidentId) : null;
    };

    const [i1, i2, i3, i4, i5] = await Promise.all(["R1", "R2", "R3", "R4", "R5"].map(incidentOf));
    expect(i1).not.toBeNull();
    expect(i2?.id).toBe(i1!.id);
    expect(i3?.id).toBe(i1!.id);
    expect(i4?.id).toBe(i1!.id);
    // A flood 20 km away is a different incident, not a member.
    expect(i5?.id).not.toBe(i1!.id);
  });

  it("flags the forwarded report as a copy and does not count it as an independent source", async () => {
    const db = getDb();
    const incident = await db.incidents.get((await db.reports.get(ids.R1))!.incidentId!);
    const copy = incident!.members.find((m) => m.reportId === ids.R3);

    expect(copy?.copyOf).toBe(ids.R1);
    expect(copy?.copyReasons?.join(" ")).toMatch(/Near-identical wording/);
    // Four members, one of them a copy: three independent sources.
    expect(incident!.members).toHaveLength(4);
    expect(incident!.independentSources).toBe(3);
  });

  it("flags the road-status contradiction between the blocked and the open report", async () => {
    const db = getDb();
    const incident = await db.incidents.get((await db.reports.get(ids.R1))!.incidentId!);
    const contradictions = await db.contradictions.list({ where: [{ field: "incidentId", op: "==", value: incident!.id }] });
    const kinds = contradictions.map((c) => c.kind);

    expect(kinds).toContain("road_status");
    expect(contradictions.every((c) => c.detectedBy === "rule")).toBe(true);
    expect(incident!.openContradictions).toBe(contradictions.filter((c) => c.status === "open").length);
  });

  it("stores a suggestion with its feature breakdown and score, for a reviewer to judge", async () => {
    const db = getDb();
    const suggestions = await db.suggestions.list({ where: [{ field: "regionId", op: "==", value: "np" }] });
    const r1r2 = suggestions.find((s) => s.reportIds.includes(ids.R1) && s.reportIds.includes(ids.R2));

    expect(r1r2).toBeDefined();
    expect(r1r2!.score).toBeGreaterThan(0.5);
    expect(r1r2!.features.distanceKm).toBeGreaterThan(0);
    expect(r1r2!.features.hazardMatch).toBe("same");
    // No model was available, so the comparison half is absent rather than invented.
    expect(r1r2!.ai).toBeUndefined();
    expect(r1r2!.status).toBe("pending");
  });

  it("never suggests a pair whose hazards are incompatible", async () => {
    const db = getDb();
    const suggestions = await db.suggestions.list({ where: [{ field: "regionId", op: "==", value: "np" }] });
    const floodPairs = suggestions.filter((s) => s.reportIds.includes(ids.R5));
    expect(floodPairs).toHaveLength(0);
  });

  it("writes an audit trail for everything the system did", async () => {
    const db = getDb();
    const events = await db.events.list({});
    const actions = events.map((e) => e.action);
    expect(actions).toContain("incident.created");
    expect(actions).toContain("suggestion.created");
    expect(actions).toContain("contradiction.flagged");
    expect(events.every((e) => e.actor.kind === "system" || e.actor.kind === "ai" || e.actor.kind === "public")).toBe(true);
  });

  it("uses the model verdict when one is available, and turns its conflicts into flags", async () => {
    const db = getDb();
    // Answer every comparison the same way: R1 is compared with R2 and R4, and the pair it lands in
    // is chosen by score, so a positional script would be brittle.
    const responder = (req: LlmRequest) => {
      const text = req.parts.map((p) => ("text" in p ? p.text : "")).join("\n");
      const alias = text.split("\n").find((l) => l.startsWith("[A1]"))?.match(/\[(A\d+)\]/)?.[1] ?? "A1";
      const other = text.split("\n").find((l) => l.startsWith("[B1]"))?.match(/\[(B\d+)\]/)?.[1] ?? "B1";
      return {
        verdict: "likely_same",
        rationale: `Both reports describe the same landslide blocking the highway near Larcha (${alias}, ${other}).`,
        agreements: [{ text: "The highway is blocked near Larcha", claims: [alias, other] }],
        conflicts: [],
        missing: ["How long the road will stay closed"],
        copySignals: [],
      };
    };
    const llm = new FakeLlm(Array.from({ length: 6 }, () => responder));

    const result = await runMatchingForReport(ids.R1, llm, { maxAgeHours: 24 });
    const withAi = result.suggestions.find((s) => s.reportIds.includes(ids.R2) && s.ai);

    expect(result.aiAvailable).toBe(true);
    expect(result.comparedWithModel).toBeGreaterThan(0);
    expect(withAi?.ai?.verdict).toBe("likely_same");
    expect(withAi?.ai?.agreements[0].claimIds.length).toBe(2);
    expect(withAi?.ai?.citationsRejected).toBe(0);
    expect(await db.suggestions.get(withAi!.id)).toMatchObject({ ai: { verdict: "likely_same" } });
  });

  it("drops a model conflict that does not cite both reports", async () => {
    const db = getDb();
    const responder = (req: LlmRequest) => {
      const text = req.parts.map((p) => ("text" in p ? p.text : "")).join("\n");
      const alias = text.split("\n").find((l) => l.startsWith("[A1]"))?.match(/\[(A\d+)\]/)?.[1] ?? "A1";
      return {
        verdict: "possibly_same",
        rationale: `Unclear (${alias}).`,
        agreements: [],
        // Cites only side A: a conflict needs both sides, so this must be dropped.
        conflicts: [{ kind: "road_status", text: "One says blocked, the other open", claims: [alias] }],
        missing: [],
        copySignals: [],
      };
    };
    const llm = new FakeLlm(Array.from({ length: 6 }, () => responder));

    const result = await runMatchingForReport(ids.R1, llm, { maxAgeHours: 24 });
    const target = result.suggestions.find((s) => s.reportIds.includes(ids.R2));
    expect(target?.ai?.conflicts).toHaveLength(0);
    expect(await db.contradictions.list({ where: [{ field: "detectedBy", op: "==", value: "ai" }] })).toHaveLength(0);
  });
});
