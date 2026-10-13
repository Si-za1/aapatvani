// A timing harness for the deterministic half of the pipeline.
//
// Nothing it measures calls a model, so it runs today, with no credentials, on any machine. That is
// also the honest boundary of the number: the AI half of the app cannot be timed until there is a
// key, and this script deliberately says so rather than leaving the gap to be noticed later.

import { loadDataset } from "@/lib/geo/dataset";
import { analyzeBlastRadius } from "@/lib/geo/blast-radius";

const RUNS = 30;
const DATASET_ID = "np-araniko-corridor";

function report(label: string, samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  console.log(
    `${label.padEnd(40)} min ${at(0).toFixed(1).padStart(7)} ms   median ${at(0.5).toFixed(1).padStart(7)} ms   p95 ${at(0.95).toFixed(1).padStart(7)} ms`,
  );
}

async function main() {
  const started = performance.now();
  const dataset = await loadDataset(DATASET_ID);
  const loadMs = performance.now() - started;
  if (!dataset) throw new Error("dataset did not load");

  const facilities = dataset.assets.filter((a) => a.kind === "health_facility");
  console.log(`dataset   ${dataset.manifest.name} · snapshot ${dataset.manifest.snapshot}`);
  console.log(`size      ${dataset.graph.nodeCount} junctions · ${facilities.length} health facilities · ${dataset.gazetteer.length} gazetteer entries`);
  console.log(`node      ${process.version} on ${process.platform}/${process.arch}`);
  console.log("");

  // The demo incident: the Larcha–Tatopani stretch of the Arniko Highway.
  const input = {
    graph: dataset.graph,
    assets: dataset.assets,
    manifest: dataset.manifest,
    incident: { lat: 27.9385, lng: 85.9418, uncertaintyM: 250 },
    blockage: {
      claimIds: ["c1", "c2", "c3"],
      claimStatus: { c1: "unreviewed", c2: "unreviewed", c3: "unreviewed" },
      roadNames: ["Arniko Highway (NH34)"],
    },
  };

  // Cold: the first call builds the multi-source shortest-path tables.
  const coldStart = performance.now();
  const first = analyzeBlastRadius(input);
  const coldMs = performance.now() - coldStart;

  const warm: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    analyzeBlastRadius(input);
    warm.push(performance.now() - start);
  }

  report("dataset load + graph build (cold)", [loadMs]);
  report("road analysis, first call (cold)", [coldMs]);
  report(`road analysis (${RUNS} runs, warm)`, warm);
  console.log("");
  console.log(`result    ${first.candidates.length} findings · ${first.status}`);
  console.log(
    `          ${first.stats.settlementsAnalysed} settlements analysed · ${first.stats.lostAccessAny} lose every route · ${first.stats.longerRouteAny} take a longer one · ${first.stats.facilitiesAffected} facilities affected`,
  );
  console.log("");
  console.log("Not measured here: extraction, matching and drafting — every one of those calls Gemini,");
  console.log("so their latency and their accuracy need credentials. Run `npm run eval -- --mode gemini`.");
}

void main();
