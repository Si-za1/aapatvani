import "server-only";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EvalReport } from "./run";

// Saved evaluation runs. A result is only worth anything if you can say when it was produced and
// with what model, so the file name carries both and the report keeps them inside too.
//
// Results are committed rather than git-ignored: the numbers on /evaluation should be readable
// without running anything, and a judge should be able to see exactly what was measured.

const RESULTS_DIR = path.join(process.cwd(), "data", "eval");

function fileName(report: EvalReport): string {
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  return `${report.mode}-${stamp}.json`;
}

export async function saveEvalReport(report: EvalReport): Promise<string> {
  await mkdir(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, fileName(report));
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return file;
}

export interface LoadedEval {
  report: EvalReport;
  file: string;
}

/** Every saved run, newest first. */
export async function listEvalReports(): Promise<LoadedEval[]> {
  let names: string[];
  try {
    names = await readdir(RESULTS_DIR);
  } catch {
    return [];
  }
  const loaded: LoadedEval[] = [];
  for (const name of names.filter((n) => n.endsWith(".json")).sort().reverse()) {
    try {
      const report = JSON.parse(await readFile(path.join(RESULTS_DIR, name), "utf8")) as EvalReport;
      loaded.push({ report, file: name });
    } catch {
      // A half-written or hand-edited file must not take the page down.
    }
  }
  return loaded.sort((a, b) => b.report.generatedAt.localeCompare(a.report.generatedAt));
}

/**
 * The run to show: the newest Gemini-mode result if there is one, since that is the only mode that
 * says anything about reading reports, otherwise the newest oracle run.
 */
export async function latestEvalReport(): Promise<LoadedEval | null> {
  const all = await listEvalReports();
  return all.find((entry) => entry.report.mode === "gemini") ?? all[0] ?? null;
}
