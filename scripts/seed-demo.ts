// Seeds the demo scenario onto the local store, then runs matching over it.
//
//   npm run seed          # the demo scenario
//   npm run seed:reset    # clear it again
//
// Why this exists: without Gemini, extraction produces no claims, so the reviewer screens would have
// nothing to show and could not be checked. This writes the reports *and* the claims an extraction
// would have produced, the same records the pipeline builds, so the review, incident and impact
// screens can be exercised end to end without credentials.
//
// The scenario itself lives in lib/eval/scenarios.ts, shared with the evaluation, so the demo and
// the measured results can never describe different situations. Everything is synthetic, over the
// real Araniko corridor road network, and every record carries the `synthetic` label.

import { readFileSync } from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import type { MediaItem } from "@/lib/domain/schemas";
import { DEMO_SCENARIO_ID, getScenario, type Scenario } from "@/lib/eval/scenarios";
import { seedScenario } from "@/lib/eval/run";
import { newId, sha256Hex } from "@/lib/ids";
import { runMatchingForReport } from "@/lib/matching/service";
import { getMediaStore } from "@/lib/storage";

const selected = getScenario(process.env.SEED_SCENARIO ?? DEMO_SCENARIO_ID);

const MEDIA_DIR = path.join(process.cwd(), "data", "eval", "media");
const ILLUSTRATION = "Illustration synthesised for this prototype. Not a photograph of a real event.";
const SYNTHETIC_SPEECH = "Speech synthesised on this device for this prototype.";

/**
 * Fixture media, by scenario report key.
 *
 * The scenario itself carries no media — `lib/eval/scenarios.ts` is shared with the evaluation, and
 * the evaluation deliberately sends none, so attaching files there would change what is measured.
 * The demo needs them anyway: a photograph and a voice note ARE the evidence for the claims built
 * from them, and a reviewer screen that only ever shows text is not the screen a judge should see.
 *
 * R3 is a forwarded copy of R1, so it carries the SAME photograph. That is not decoration — a shared
 * photo hash is one of the ways a copy is caught, so the copy in the demo is now caught twice, by
 * its wording and by its file.
 */
const DEMO_MEDIA: Record<string, Array<{ file: string; kind: "photo" | "audio"; mimeType: string; attribution: string }>> = {
  R1: [{ file: "landslide-larcha.png", kind: "photo", mimeType: "image/png", attribution: ILLUSTRATION }],
  R2: [{ file: "voice-browser-recorded.webm", kind: "audio", mimeType: "audio/webm", attribution: SYNTHETIC_SPEECH }],
  R3: [{ file: "landslide-larcha.png", kind: "photo", mimeType: "image/png", attribution: ILLUSTRATION }],
};

/**
 * Writes the fixture files into the configured media store and points each report at them.
 *
 * Runs BEFORE matching, because copy detection compares photo hashes — attaching the media
 * afterwards would leave the forwarded copy undetected by its file and quietly change what the demo
 * shows.
 */
async function attachDemoMedia(reportIdByKey: Map<string, string>): Promise<void> {
  const db = getDb();
  const store = getMediaStore();
  for (const [key, specs] of Object.entries(DEMO_MEDIA)) {
    const reportId = reportIdByKey.get(key);
    if (!reportId) continue;
    const media: MediaItem[] = [];
    for (const spec of specs) {
      const data = readFileSync(path.join(MEDIA_DIR, spec.file));
      const mediaId = newId("med");
      const extension = spec.file.split(".").pop() ?? "bin";
      const objectPath = `reports/${reportId}/${mediaId}.${extension}`;
      await store.put(objectPath, data, spec.mimeType);
      media.push({
        id: mediaId,
        kind: spec.kind,
        mimeType: spec.mimeType,
        sizeBytes: data.length,
        sha256: sha256Hex(data),
        storagePath: objectPath,
        originalName: spec.file,
        attribution: spec.attribution,
      });
    }
    await db.reports.update(reportId, { media });
  }
}

/**
 * Shifts the scenario forward so its last report lands in the recent past.
 *
 * The scenario's timestamps are fixed (`BASE = 2026-07-14`) because the evaluation has to be
 * deterministic — the same input must give the same output every run. On a live deployment that
 * stops being a detail: the dashboard renders relative times, so a judge opening the demo sees an
 * incident still "awaiting review" that was reported ninety-odd days ago, and reads the whole
 * deployment as stale. Every report moves by the same offset, so the gaps between them — which is
 * what the matching rules actually depend on — are untouched. Only the seed does this; the
 * evaluation keeps running against the fixed dates.
 */
function recent(s: Scenario): Scenario {
  const base = Date.parse(s.baseTime);
  const lastOffsetMin = Math.max(...s.reports.map((r) => r.offsetMinutes));
  const shiftMs = Date.now() - 45 * 60_000 - (base + lastOffsetMin * 60_000);
  return { ...s, baseTime: new Date(base + shiftMs).toISOString() };
}

async function seed(): Promise<void> {
  if (!selected) {
    console.error(`No scenario called "${process.env.SEED_SCENARIO ?? DEMO_SCENARIO_ID}".`);
    process.exit(1);
  }
  const scenario = recent(selected);
  const db = getDb();

  const existing = await db.reports.list({ where: [{ field: "regionId", op: "==", value: "np" }] });
  if (existing.length > 0) {
    console.warn(`The store already holds ${existing.length} report(s). Run \`npm run seed:reset\` first for a clean demo.`);
  }

  const { reportIdByKey } = await seedScenario(scenario, db);

  // Before matching, so a shared photo hash counts towards copy detection.
  await attachDemoMedia(reportIdByKey);

  // Matching runs in submission order, exactly as it would for live reports arriving.
  const ordered = [...scenario.reports].sort((a, b) => a.offsetMinutes - b.offsetMinutes);
  for (const spec of ordered) {
    const result = await runMatchingForReport(reportIdByKey.get(spec.key)!, null, { rulesOnly: true });
    const incident = result.incident;
    console.log(
      `  ${spec.key}: ${result.suggestions.length} suggestion(s), ${result.contradictions.length} contradiction(s)` +
        (incident ? ` → ${incident.title} [${incident.status}] members=${incident.members.length}` : ""),
    );
  }

  const [incidents, reports, claims, contradictions] = await Promise.all([
    db.incidents.list({}),
    db.reports.list({}),
    db.claims.list({}),
    db.contradictions.list({}),
  ]);

  console.log(`\nSeeded "${scenario.name}":`);
  console.log(
    `  ${reports.length} reports · ${claims.length} claims · ${incidents.length} incident(s) · ${contradictions.length} contradiction(s)`,
  );
  for (const incident of incidents) {
    console.log(
      `  · ${incident.title}, ${incident.members.length} members, ${incident.independentSources} independent source(s), ${incident.openContradictions} open`,
    );
  }

  console.log("\nOpen http://localhost:3000/dashboard and sign in as a reviewer.");
  console.log("Nothing has been read by a model: the claims here stand in for what extraction would produce.");
}

seed().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
