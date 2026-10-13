import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Info, TriangleAlert } from "lucide-react";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireReviewer } from "@/lib/auth";
import { listEvalReports, type LoadedEval } from "@/lib/eval/results";
import type { ScenarioResult } from "@/lib/eval/run";
import { formatDateTime } from "@/lib/time";

// The measured results (project.md §12, feature M13). Everything on this page comes from a saved
// run of `npm run eval`; nothing is typed in by hand, and the model and date travel with the
// numbers so a result cannot be quoted without them.

export const metadata: Metadata = { title: "Evaluation" };

export default function EvaluationPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse bg-sand" aria-hidden />}>
      <Screen />
    </Suspense>
  );
}

function percent(value: number | null, digits = 0): string {
  return value === null ? "not measured" : `${(value * 100).toFixed(digits)}%`;
}

async function Screen() {
  const reviewer = await requireReviewer("/evaluation");
  const runs = await listEvalReports();
  const shown: LoadedEval | null = runs.find((entry) => entry.report.mode === "gemini") ?? runs[0] ?? null;

  return (
    <AppShell current="/evaluation" reviewer={reviewer}>
      <PageHeader
        title="Evaluation"
        description="Measured results from the labelled scenarios, produced by npm run eval. Reproduce them with that command."
      >
        {runs.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {runs.length} saved run{runs.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </PageHeader>

      <div className="flex flex-col gap-6">
        {shown === null ? (
          <p className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <BarChart3 className="size-6 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">No results yet</span>
            <span className="text-sm text-muted-foreground">
              Run <code className="rounded bg-sand px-1.5 py-0.5">npm run eval</code> to measure the scenarios.
            </span>
          </p>
        ) : (
          <>
            <Card className="gap-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className={`rounded-full text-xs ${shown.report.mode === "gemini" ? "bg-violet-tint text-violet-strong" : "bg-moss-tint text-moss-strong"}`}>
                  {shown.report.mode === "gemini" ? "Gemini mode" : "Oracle mode"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {formatDateTime(shown.report.generatedAt, "Asia/Kathmandu")}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{shown.report.model}</span>
              </div>

              <p className="text-sm">
                {shown.report.mode === "gemini" ? (
                  <>
                    Real extraction ran against Gemini, so these numbers include how well the model read the reports.
                  </>
                ) : (
                  <>
                    No model was called. The expected claims were fed in as if extraction had produced them, which
                    measures the deterministic half of the pipeline, grouping, copy detection, contradictions and road
                    impact, exactly. It says nothing about how well Gemini reads a report; run{" "}
                    <code className="rounded bg-sand px-1.5 py-0.5">npm run eval -- --mode gemini</code> for that once
                    credentials exist.
                  </>
                )}
              </p>

              <p className="flex items-start gap-2 rounded-xl bg-amber-tint px-3 py-2.5 text-xs text-amber-strong">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {shown.report.caveat}
              </p>
            </Card>

            <section aria-labelledby="totals-heading" className="flex flex-col gap-3">
              <h2 id="totals-heading" className="text-sm font-semibold">
                Overall
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Metric
                  label="Grouping precision"
                  value={percent(shown.report.totals.grouping.precision)}
                  hint="Of the pairs the system grouped, how many should have been"
                />
                <Metric
                  label="Grouping recall"
                  value={percent(shown.report.totals.grouping.recall)}
                  hint="Of the pairs that belong together, how many were grouped"
                />
                <Metric
                  label="False merges"
                  value={String(shown.report.totals.grouping.falseMerges)}
                  hint="Reports joined that should not have been, the costliest error"
                  tone="alert"
                />
                <Metric label="Missed matches" value={String(shown.report.totals.grouping.missed)} hint="Pairs left apart that belong together" />
                <Metric label="Copy detection precision" value={percent(shown.report.totals.copies.precision)} hint="Flagged copies that really are copies" />
                <Metric label="Copy detection recall" value={percent(shown.report.totals.copies.recall)} hint="Copies that were flagged" />
                <Metric
                  label="Contradiction recall"
                  value={`${shown.report.totals.contradictions.found} of ${shown.report.totals.contradictions.expected}`}
                  hint="Disagreements the system should flag"
                />
                <Metric
                  label="Correct abstentions"
                  value={`${shown.report.totals.abstention.correct} of ${shown.report.totals.abstention.total}`}
                  hint="Reports it declined to place instead of guessing"
                />
                <Metric
                  label="Impact scenarios correct"
                  value={`${shown.report.totals.impact.ok} of ${shown.report.totals.impact.checked}`}
                  hint="Road-access expectations met exactly"
                />
              </div>
            </section>

            {shown.report.scenarios.some((scenario) => scenario.extraction) ? (
              <section aria-labelledby="extraction-heading" className="flex flex-col gap-3">
                <h2 id="extraction-heading" className="text-sm font-semibold">
                  Reading the reports
                </h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    totalsFor(shown.report.scenarios, "Claims matched", (s) => s.extraction?.claims),
                    totalsFor(shown.report.scenarios, "Hazard category right", (s) => s.extraction?.hazards),
                    totalsFor(shown.report.scenarios, "Excerpts found in the original", (s) => s.extraction?.excerptsVerified),
                  ]
                    .filter((metric): metric is NonNullable<typeof metric> => metric !== null)
                    .map((metric) => (
                      <Metric key={metric.label} {...metric} />
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Citation checks across this run:{" "}
                  {shown.report.scenarios.reduce((sum, s) => sum + (s.extraction?.citationsChecked ?? 0), 0)} checked,{" "}
                  {shown.report.scenarios.reduce((sum, s) => sum + (s.extraction?.citationsRejected ?? 0), 0)} rejected,{" "}
                  {shown.report.scenarios.reduce((sum, s) => sum + (s.extraction?.droppedClaims ?? 0), 0)} claims dropped
                  for citing something that was not there.
                </p>
              </section>
            ) : null}

            <section aria-labelledby="scenarios-heading" className="flex flex-col gap-3">
              <h2 id="scenarios-heading" className="text-sm font-semibold">
                Scenarios
              </h2>
              <ul className="flex flex-col gap-2">
                {shown.report.scenarios.map((scenario) => (
                  <li key={scenario.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{scenario.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{scenario.id}</span>
                      <span className="text-xs text-muted-foreground">{scenario.reports} reports</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <Fact label="Grouping" value={`P ${percent(scenario.grouping.precision)} · R ${percent(scenario.grouping.recall)}`} />
                      {scenario.copies.truePositives + scenario.copies.falsePositives + scenario.copies.falseNegatives > 0 ? (
                        <Fact label="Copies" value={`P ${percent(scenario.copies.precision)} · R ${percent(scenario.copies.recall)}`} />
                      ) : null}
                      {scenario.contradictions.expected > 0 ? (
                        <Fact label="Contradictions" value={`${scenario.contradictions.found}/${scenario.contradictions.expected}`} />
                      ) : null}
                      {scenario.abstention.total > 0 ? (
                        <Fact label="Abstentions" value={`${scenario.abstention.correct}/${scenario.abstention.total}`} />
                      ) : null}
                      {scenario.impact?.ran ? <Fact label="Impact" value={scenario.impact.ok ? "as expected" : "MISMATCH"} /> : null}
                      {scenario.extraction ? (
                        <Fact label="Claims read" value={`${scenario.extraction.claims.correct}/${scenario.extraction.claims.total}`} />
                      ) : null}
                    </div>
                    {scenario.grouping.falseMerges.length > 0 ? (
                      <p className="text-xs text-flame-strong">False merges: {scenario.grouping.falseMerges.join(", ")}</p>
                    ) : null}
                    {scenario.grouping.missed.length > 0 ? (
                      <p className="text-xs text-amber-strong">Missed: {scenario.grouping.missed.join(", ")}</p>
                    ) : null}
                    {scenario.contradictions.missed.length > 0 ? (
                      <p className="text-xs text-amber-strong">Missed contradictions: {scenario.contradictions.missed.join("; ")}</p>
                    ) : null}
                    {scenario.impact?.ran && !scenario.impact.ok ? (
                      <p className="text-xs text-flame-strong">
                        Impact mismatch, blocked road found: {scenario.impact.blockedRoadFound ?? "none"}; expected{" "}
                        {scenario.impact.expectedLostAccess.join(", ")} to lose access, found{" "}
                        {scenario.impact.foundLostAccess.join(", ") || "none"}.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="runs-heading" className="flex flex-col gap-3">
              <h2 id="runs-heading" className="text-sm font-semibold">
                Saved runs
              </h2>
              <ul className="flex flex-col gap-1.5 text-xs">
                {runs.map((entry) => (
                  <li key={entry.file} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
                    <span className="font-mono">{entry.file}</span>
                    <span className="text-muted-foreground">{formatDateTime(entry.report.generatedAt, "Asia/Kathmandu")}</span>
                    <span className="text-muted-foreground">{entry.report.model}</span>
                    {entry.file === shown.file ? <Badge className="rounded-full bg-moss-tint text-xs text-moss-strong">showing</Badge> : null}
                  </li>
                ))}
              </ul>
            </section>

            <p className="flex items-start gap-2 rounded-2xl bg-sand px-4 py-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                The road-impact engine also has exact expectations on a hand-built toy graph, checked by the unit test
                suite rather than by these scenarios, that is where the routing arithmetic is pinned down. See{" "}
                <code className="rounded bg-card px-1.5 py-0.5">tests/blast-radius.test.ts</code>.
              </span>
            </p>
          </>
        )}

        <p className="pb-4 text-xs text-muted-foreground">
          <Link href="/dashboard" className="underline">
            Back to the dashboard
          </Link>
        </p>
      </div>
    </AppShell>
  );
}

function totalsFor(
  scenarios: ScenarioResult[],
  label: string,
  pick: (scenario: ScenarioResult) => { correct: number; total: number } | undefined,
): { label: string; value: string; hint: string } | null {
  const measured = scenarios.map(pick).filter((value): value is { correct: number; total: number } => Boolean(value));
  if (!measured.length) return null;
  const correct = measured.reduce((sum, value) => sum + value.correct, 0);
  const total = measured.reduce((sum, value) => sum + value.total, 0);
  return { label, value: `${correct} of ${total}`, hint: "Against the hand-written answer key" };
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "alert" }) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${tone === "alert" ? "text-flame-strong" : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
