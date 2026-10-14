// Runs the labelled scenarios and writes a measured result (project.md §12).
//
//   npm run eval                 # every mode that can run here
//   npm run eval -- --mode oracle
//   npm run eval -- --mode gemini   (needs Gemini credentials)
//
// Oracle mode needs no model: the answer key is fed in as if extraction had produced it, which
// measures the deterministic half of the pipeline exactly. Gemini mode runs the real extraction and
// is the only mode that can say anything about how well reports are read.

import path from "node:path";
import { aiStatus, getLlm } from "@/lib/ai/gemini";
import { guardLlm, QuotaBudgetError } from "@/lib/ai/quota";
import { AiUnavailableError } from "@/lib/ai/types";
import { latestEvalReport, saveEvalReport } from "@/lib/eval/results";
import { SCENARIOS } from "@/lib/eval/scenarios";
import { runEvaluation, prepareScratchStore, type EvalMode, type EvalReport } from "@/lib/eval/run";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function percent(value: number | null): string {
  return value === null ? "  n/a" : `${(value * 100).toFixed(0)}%`.padStart(5);
}

function line(label: string, value: string): void {
  console.log(`  ${label.padEnd(34)} ${value}`);
}

function summarise(report: EvalReport): void {
  console.log(`\n${report.mode.toUpperCase()} mode · model ${report.model} · ${report.generatedAt}`);
  console.log(`  ${report.scenarios.length} scenarios, ${report.scenarios.reduce((n, s) => n + s.reports, 0)} reports\n`);

  for (const scenario of report.scenarios) {
    const bits = [
      `grouping P${percent(scenario.grouping.precision)} R${percent(scenario.grouping.recall)}`,
      scenario.copies.truePositives + scenario.copies.falsePositives + scenario.copies.falseNegatives > 0
        ? `copies P${percent(scenario.copies.precision)} R${percent(scenario.copies.recall)}`
        : null,
      scenario.contradictions.expected ? `contradictions ${scenario.contradictions.found}/${scenario.contradictions.expected}` : null,
      scenario.abstention.total ? `abstention ${scenario.abstention.correct}/${scenario.abstention.total}` : null,
      scenario.impact?.ran ? `impact ${scenario.impact.ok ? "ok" : "MISMATCH"}` : null,
      scenario.extraction ? `claims ${scenario.extraction.claims.correct}/${scenario.extraction.claims.total}` : null,
    ].filter(Boolean);
    console.log(`  ${scenario.id}`);
    console.log(`    ${bits.join(" · ")}`);
    for (const missed of scenario.grouping.missed) console.log(`    missed: ${missed}`);
    for (const merge of scenario.grouping.falseMerges) console.log(`    false merge: ${merge}`);
    for (const missed of scenario.contradictions.missed) console.log(`    missed contradiction: ${missed}`);
    if (scenario.impact?.ran && !scenario.impact.ok) {
      console.log(
        `    impact: expected road "${scenario.impact.expectedLostAccess.join(", ")}" to lose access; found "${scenario.impact.foundLostAccess.join(", ")}"; blocked road "${scenario.impact.blockedRoadFound ?? "none"}"`,
      );
    }
  }

  console.log("\n  Overall");
  line("grouping precision", percent(report.totals.grouping.precision));
  line("grouping recall", percent(report.totals.grouping.recall));
  line("false merges", String(report.totals.grouping.falseMerges));
  line("missed matches", String(report.totals.grouping.missed));
  line("copy detection precision", percent(report.totals.copies.precision));
  line("copy detection recall", percent(report.totals.copies.recall));
  line("contradiction recall", `${report.totals.contradictions.found}/${report.totals.contradictions.expected}`);
  line("correct abstentions", `${report.totals.abstention.correct}/${report.totals.abstention.total}`);
  line("impact scenarios correct", `${report.totals.impact.ok}/${report.totals.impact.checked}`);
  console.log(`\n  ${report.caveat}`);
}

async function main(): Promise<void> {
  const requested = (arg("mode") ?? "auto") as EvalMode | "auto";
  // `--scenario larcha-main` (or a comma-separated list) runs a subset. Needed on a metered key,
  // where a full Gemini-mode run costs more requests in a day than the key allows.
  const only = arg("scenario")?.split(",").map((s) => s.trim()).filter(Boolean);
  const status = aiStatus();
  const base = getLlm();
  // Metered, like the multimodal check. A Gemini-mode run is the single most expensive thing this
  // project does — roughly forty to fifty-five requests — so it is the last run that should be
  // allowed to discover a daily ceiling by hitting it.
  const llm = base
    ? guardLlm(base, {
        onCall: (info) =>
          console.log(
            `  [${info.kind}] ${info.answered} #${info.countForAnswered} today · ${info.latencyMs} ms` +
              (info.waitedMs > 500 ? ` · waited ${Math.round(info.waitedMs / 1000)} s` : ""),
          ),
      })
    : null;
  const store = prepareScratchStore();

  const modes: EvalMode[] = requested === "auto" ? (llm ? ["oracle", "gemini"] : ["oracle"]) : [requested];

  if (requested === "auto" && !llm) {
    console.log("Gemini is not configured, so only oracle mode will run.");
    console.log("The deterministic half of the pipeline is measured exactly; extraction accuracy is not measured here.\n");
  }
  if (requested === "gemini" && !llm) {
    console.error("Gemini mode needs credentials. See .env.example, then `npm run check:models` to confirm the connection.");
    process.exit(1);
  }

  console.log(`AI backend: ${status.label}`);

  for (const mode of modes) {
    try {
      const report = await runEvaluation(mode, store, mode === "gemini" ? llm : null, only);
      const file = await saveEvalReport(report);
      summarise(report);
      if (only?.length) {
        console.log(
          `\n  NOTE: a subset — ${report.scenarios.length} of ${SCENARIOS.length} scenarios ran ` +
            `(${only.join(", ")}). These numbers do not describe the full set.`,
        );
      }
      console.log(`\n  saved: ${path.relative(process.cwd(), file)}\n`);
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        console.error(`Skipping ${mode} mode: no model configured.`);
        continue;
      }
      if (error instanceof QuotaBudgetError) {
        // Stopping is the correct outcome. A half-finished run saved as a result would be read as
        // a complete one, which is worse than having no number at all.
        console.error(`\n${error.message}\nStopping ${mode} mode with nothing saved.`);
        continue;
      }
      throw error;
    }
  }

  const latest = await latestEvalReport();
  if (latest) console.log(`\n/evaluation will show: ${latest.file}`);
}

main().catch((error) => {
  console.error("Evaluation failed:", error);
  process.exit(1);
});
