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

import { getDb } from "@/lib/db";
import { DEMO_SCENARIO_ID, getScenario } from "@/lib/eval/scenarios";
import { seedScenario } from "@/lib/eval/run";
import { runMatchingForReport } from "@/lib/matching/service";

const scenario = getScenario(process.env.SEED_SCENARIO ?? DEMO_SCENARIO_ID);

async function seed(): Promise<void> {
  if (!scenario) {
    console.error(`No scenario called "${process.env.SEED_SCENARIO ?? DEMO_SCENARIO_ID}".`);
    process.exit(1);
  }
  const db = getDb();

  const existing = await db.reports.list({ where: [{ field: "regionId", op: "==", value: "np" }] });
  if (existing.length > 0) {
    console.warn(`The store already holds ${existing.length} report(s). Run \`npm run seed:reset\` first for a clean demo.`);
  }

  const { reportIdByKey } = await seedScenario(scenario, db);

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
