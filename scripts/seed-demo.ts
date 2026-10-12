// Seeds the demo scenario from project.md §12 on the local store, then runs matching over it.
//
//   npm run seed
//
// Why this exists before chunk 8's evaluation set: without Gemini, extraction produces no claims, so
// the reviewer screens would have nothing to show and could not be checked. This writes the reports
// *and* the claims an extraction would have produced — the same records the pipeline builds — so the
// review, incident and impact screens can be exercised end to end without credentials.
//
// Everything here is synthetic, over the real Araniko corridor road network. Run `npm run seed:reset`
// to clear it.

import { getDb } from "@/lib/db";
import type { Claim, Extraction, Report } from "@/lib/domain/schemas";
import { locateExcerpt } from "@/lib/evidence/excerpt";
import { newId, newReferenceCode } from "@/lib/ids";
import { runMatchingForReport } from "@/lib/matching/service";
import { recordAudit, systemActor } from "@/lib/audit";

const LARCHA = { lat: 27.93309, lng: 85.93534 };
const TATOPANI = { lat: 27.9385, lng: 85.9418 };

const R1_TEXT =
  "आज बिहान लार्चा नजिक अरनिको राजमार्गमा ठूलो पहिरो खस्यो। बाटो पूरै बन्द छ, सवारी अड्किएका छन्। " +
  "पहिरोले करिब डेढ सय मिटर बाटो ढाकेको छ।";
const R2_TEXT =
  "A large landslide came down across the Arniko Highway near Larcha early this morning. The road towards Tatopani " +
  "is completely blocked and several vehicles are stuck on both sides.";
const R3_TEXT = R1_TEXT;
const R4_TEXT = "Road is open near Larcha now. Only small debris on the shoulder and vehicles are passing normally.";
const R5_TEXT = "बाढीले खेत डुबानमा परेको छ। इन्द्रावती नदीको पानी बढेको छ।";

interface SeedClaim {
  type: Claim["type"];
  statement: string;
  statementEn: string;
  /** Quoted from the report text; offsets are located the same way the real pipeline locates them. */
  excerptText?: string;
  hazardCategory?: string;
  roadStatus?: Claim["roadStatus"];
  roadName?: string;
  origin?: Claim["origin"];
}

interface SeedSpec {
  key: string;
  text: string;
  uiLanguage: "ne" | "en";
  hazard: string;
  location: { source: "gps" | "pin" | "place_name"; lat?: number; lng?: number; accuracyM?: number; placeText?: string };
  submittedAt: string;
  reporterToken: string;
  claims: SeedClaim[];
  embedding: number[];
  translation?: string;
}

const BASE_TIME = Date.parse("2026-07-14T01:30:00.000Z");

const SEEDS: SeedSpec[] = [
  {
    key: "R1",
    text: R1_TEXT,
    uiLanguage: "ne",
    hazard: "landslide",
    location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng, accuracyM: 30 },
    submittedAt: new Date(BASE_TIME).toISOString(),
    reporterToken: "tok_demo_r1",
    translation:
      "A big landslide came down on the Arniko Highway near Larcha this morning. The road is completely blocked and vehicles are stuck. The landslide covers about 150 metres of road.",
    embedding: [1, 0, 0, 0],
    claims: [
      { type: "hazard", hazardCategory: "landslide", statement: "पहिरो खस्यो", statementEn: "A landslide came down", excerptText: "पहिरो खस्यो" },
      { type: "impact_road", roadStatus: "blocked", roadName: "Arniko Highway", statement: "बाटो पूरै बन्द छ", statementEn: "The road is completely blocked", excerptText: "बाटो पूरै बन्द छ" },
      { type: "event", statement: "करिब डेढ सय मिटर बाटो ढाकेको छ", statementEn: "About 150 m of road is covered", excerptText: "करिब डेढ सय मिटर बाटो ढाकेको छ" },
    ],
  },
  {
    key: "R2",
    text: R2_TEXT,
    uiLanguage: "en",
    hazard: "landslide",
    location: { source: "pin", lat: TATOPANI.lat, lng: TATOPANI.lng },
    submittedAt: new Date(BASE_TIME + 40 * 60_000).toISOString(),
    reporterToken: "tok_demo_r2",
    embedding: [0.95, 0.05, 0, 0],
    claims: [
      { type: "hazard", hazardCategory: "landslide", statement: "A large landslide came down", statementEn: "A large landslide came down", excerptText: "A large landslide came down" },
      { type: "impact_road", roadStatus: "blocked", roadName: "Araniko Rajmarg", statement: "The road towards Tatopani is completely blocked", statementEn: "The road towards Tatopani is completely blocked", excerptText: "road towards Tatopani" },
    ],
  },
  {
    key: "R3",
    // A forwarded copy: same words, different device.
    text: R3_TEXT,
    uiLanguage: "ne",
    hazard: "landslide",
    location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng, accuracyM: 30 },
    submittedAt: new Date(BASE_TIME + 110 * 60_000).toISOString(),
    reporterToken: "tok_demo_r3",
    embedding: [1, 0, 0, 0],
    claims: [
      { type: "impact_road", roadStatus: "blocked", roadName: "Arniko Highway", statement: "बाटो पूरै बन्द छ", statementEn: "The road is completely blocked", excerptText: "बाटो पूरै बन्द छ" },
    ],
  },
  {
    key: "R4",
    text: R4_TEXT,
    uiLanguage: "en",
    hazard: "landslide",
    location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng, accuracyM: 60 },
    submittedAt: new Date(BASE_TIME + 135 * 60_000).toISOString(),
    reporterToken: "tok_demo_r4",
    embedding: [0.55, 0.45, 0, 0],
    claims: [
      { type: "impact_road", roadStatus: "passable", statement: "The road is open", statementEn: "The road is open", excerptText: "Road is open near Larcha" },
    ],
  },
  {
    key: "R5",
    text: R5_TEXT,
    uiLanguage: "ne",
    hazard: "flood",
    location: { source: "gps", lat: 27.75, lng: 85.75, accuracyM: 100 },
    submittedAt: new Date(BASE_TIME + 150 * 60_000).toISOString(),
    reporterToken: "tok_demo_r5",
    translation: "Fields are flooded. The Indrawati river has risen.",
    embedding: [0, 0, 1, 0],
    claims: [
      { type: "hazard", hazardCategory: "flood", statement: "बाढीले खेत डुबानमा परेको छ", statementEn: "Fields are flooded", excerptText: "बाढीले खेत डुबानमा परेको छ" },
    ],
  },
];

async function seed(): Promise<void> {
  const db = getDb();
  const ids: Record<string, string> = {};

  for (const spec of SEEDS) {
    const reportId = newId("rep");
    ids[spec.key] = reportId;
    const extractionId = newId("ext");

    const report: Report = {
      id: reportId,
      referenceCode: newReferenceCode(),
      regionId: "np",
      dataLabel: "synthetic",
      text: spec.text,
      uiLanguage: spec.uiLanguage,
      reporterHazard: spec.hazard,
      location: spec.location,
      timeHint: "earlier_today",
      reportedTimeText: spec.uiLanguage === "ne" ? "आज बिहान" : "early this morning",
      submittedAt: spec.submittedAt,
      media: [],
      reporterToken: spec.reporterToken,
      status: "extracted",
      latestExtractionId: extractionId,
      scenario: { id: "demo-larcha", key: spec.key },
    };
    await db.reports.create(report);

    const extraction: Extraction = {
      id: extractionId,
      reportId,
      createdAt: spec.submittedAt,
      model: "seed",
      promptVersion: "seed-v1",
      status: "ok",
      detectedLanguage: spec.uiLanguage,
      translationEn: spec.translation,
      hazardCandidates: [{ category: spec.hazard, rationale: "Stated in the report.", basis: "report_text" }],
      missingInformation: spec.key === "R4" ? [] : ["Whether anyone is injured", "How long the road will stay closed"],
      uncertaintyNotes: [],
      mediaNotes: [],
      claimIds: [],
      validation: { errors: [], warnings: [], droppedClaims: 0, unverifiedExcerpts: 0, citationsChecked: 0, citationsRejected: 0 },
      embedding: spec.embedding,
      embeddingModel: "seed",
    };
    await db.extractions.create(extraction);

    for (const partial of spec.claims) {
      // Locate the quote in the report text exactly as the real pipeline does, so the seeded
      // excerpts are verified — and their offsets usable for highlighting — for the same reasons.
      const located = partial.excerptText ? locateExcerpt(spec.text, partial.excerptText) : null;
      const claim: Claim = {
        id: newId("clm"),
        reportId,
        extractionId,
        regionId: "np",
        origin: partial.origin ?? "reporter",
        basis: "report_text",
        review: { status: "unreviewed" },
        createdAt: spec.submittedAt,
        type: partial.type,
        statement: partial.statement,
        statementEn: partial.statementEn,
        ...(partial.hazardCategory ? { hazardCategory: partial.hazardCategory } : {}),
        ...(partial.roadStatus ? { roadStatus: partial.roadStatus } : {}),
        ...(partial.roadName ? { roadName: partial.roadName } : {}),
        ...(located && partial.excerptText
          ? {
              excerpt: {
                text: partial.excerptText,
                verified: located.verified,
                field: "text" as const,
                start: located.start,
                end: located.end,
              },
            }
          : {}),
      };
      await db.claims.create(claim);
      extraction.claimIds.push(claim.id);
    }
    await db.extractions.set(extraction);

    await recordAudit({
      actor: systemActor(),
      action: "report.submitted",
      targetType: "report",
      targetId: reportId,
      reportId,
      summary: `Synthetic demo report ${spec.key} seeded.`,
    });
  }

  // Matching runs in submission order, exactly as it would for live reports.
  for (const key of SEEDS.map((s) => s.key)) {
    const result = await runMatchingForReport(ids[key], null, { rulesOnly: true });
    const incident = result.incident;
    console.log(
      `  ${key}: ${result.suggestions.length} suggestion(s), ${result.contradictions.length} contradiction(s)` +
        (incident ? ` → ${incident.title} [${incident.status}] members=${incident.members.length}` : ""),
    );
  }

  const incidents = await db.incidents.list({});
  const reports = await db.reports.list({});
  const claims = await db.claims.list({});
  const contradictions = await db.contradictions.list({});

  console.log("\nSeeded the demo scenario:");
  console.log(`  ${reports.length} reports · ${claims.length} claims · ${incidents.length} incident(s) · ${contradictions.length} contradiction(s)`);
  for (const incident of incidents) {
    console.log(
      `  · ${incident.title} — ${incident.members.length} members, ${incident.independentSources} independent, ${incident.openContradictions} open`,
    );
  }
  console.log(`\nReference codes: ${Object.entries(ids).map(([key, id]) => `${key}=${id}`).join(" ")}`);
}

seed().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
