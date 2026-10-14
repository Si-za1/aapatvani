import "server-only";

// Runs the labelled scenarios through the real pipeline and scores what comes out (project.md §12).
//
// Two modes, and the difference matters when reading the numbers:
//
//   oracle , the expected claims are written in as if extraction had produced them. Nothing is
//             invented and no model is called, so this measures the deterministic half, grouping,
//             copy detection, contradictions, road impact, exactly, and can run today.
//   gemini , the real extraction runs against Gemini. This is the only mode that can say anything
//             about how well Nepali and English reports are read, and it needs credentials.
//
// Every number below is a count of cases we wrote by hand. The set is small on purpose, and the
// report says so rather than dressing a handful of examples up as a benchmark.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PROMPT_VERSIONS } from "@/config/models";
import { runExtraction } from "@/lib/ai/extraction";
import { aiStatus } from "@/lib/ai/gemini";
import { AiUnavailableError, type Llm } from "@/lib/ai/types";
import { getRegion } from "@/config/regions";
import { getDb, type Database } from "@/lib/db";
import type { Claim, Incident, Report } from "@/lib/domain/schemas";
import { locateExcerpt } from "@/lib/evidence/excerpt";
import type { GazetteerEntry } from "@/lib/geo/dataset-types";
import { newId, newReferenceCode } from "@/lib/ids";
import { runImpactAssessment } from "@/lib/impact/service";
import { runMatchingForReport } from "@/lib/matching/service";
import { SCENARIOS, type Scenario, type ScenarioReport } from "./scenarios";

export type EvalMode = "oracle" | "gemini";

export interface Rate {
  correct: number;
  total: number;
}

export interface ScenarioResult {
  id: string;
  name: string;
  mode: EvalMode;
  reports: number;
  /** Grouping, measured over report pairs. */
  grouping: { truePositives: number; falsePositives: number; falseNegatives: number; precision: number | null; recall: number | null; falseMerges: string[]; missed: string[] };
  copies: { truePositives: number; falsePositives: number; falseNegatives: number; precision: number | null; recall: number | null };
  contradictions: { found: number; expected: number; recall: number | null; missed: string[] };
  abstention: Rate;
  impact?: { ran: boolean; status?: string; blockedRoadOk?: boolean; blockedRoadFound?: string; expectedLostAccess: string[]; foundLostAccess: string[]; ok: boolean };
  /** Extraction accuracy against the answer key. Gemini mode only. */
  extraction?: { claims: Rate; hazards: Rate; excerptsVerified: Rate; droppedClaims: number; citationsRejected: number; citationsChecked: number };
  notes: string[];
}

export interface EvalReport {
  generatedAt: string;
  mode: EvalMode;
  model: string;
  promptVersions: Record<string, string>;
  aiConfigured: boolean;
  scenarios: ScenarioResult[];
  totals: {
    grouping: { precision: number | null; recall: number | null; falseMerges: number; missed: number };
    copies: { precision: number | null; recall: number | null };
    contradictions: { found: number; expected: number; recall: number | null };
    abstention: Rate;
    impact: { checked: number; ok: number };
  };
  caveat: string;
}

const pairKey = (a: string, b: string) => [a, b].sort().join("~");

function rate(correct: number, total: number): number | null {
  return total === 0 ? null : correct / total;
}

function precisionRecall(tp: number, fp: number, fn: number): { precision: number | null; recall: number | null } {
  return { precision: rate(tp, tp + fp), recall: rate(tp, tp + fn) };
}

/**
 * Points the store at a throwaway directory for the duration of the run.
 *
 * The services resolve their store through `getDb()`, which reads the environment once, so the
 * evaluation cannot hand them a private database, it has to move the room they are standing in.
 * Must be called before the first store access. Each scenario starts by clearing the directory,
 * because the file store reads from disk on every call.
 */
export function prepareScratchStore(): { dir: string; clear: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "av-eval-"));
  process.env.DATA_BACKEND = "local";
  process.env.LOCAL_DATA_DIR = dir;
  return {
    dir,
    clear: () => rmSync(path.join(dir, "db"), { recursive: true, force: true }),
  };
}

export type EvalStore = ReturnType<typeof prepareScratchStore>;

function buildReport(scenario: Scenario, spec: ScenarioReport): Report {
  const base = Date.parse(scenario.baseTime);
  return {
    id: newId("rep"),
    referenceCode: newReferenceCode(),
    regionId: "np",
    dataLabel: "synthetic",
    text: spec.text,
    uiLanguage: spec.uiLanguage,
    ...(spec.hazard ? { reporterHazard: spec.hazard } : {}),
    location: spec.location,
    timeHint: "earlier_today",
    submittedAt: new Date(base + spec.offsetMinutes * 60_000).toISOString(),
    media: [],
    reporterToken: spec.reporterToken,
    status: "extracted",
    scenario: { id: scenario.id, key: spec.key },
  };
}

/** Writes the answer key in as a completed extraction, the "oracle" half of oracle mode. */
async function seedExpectedClaims(db: Database, report: Report, spec: ScenarioReport): Promise<Claim[]> {
  const extractionId = newId("ext");
  await db.extractions.create({
    id: extractionId,
    reportId: report.id,
    createdAt: report.submittedAt,
    model: "oracle",
    promptVersion: "oracle-v1",
    status: "ok",
    detectedLanguage: spec.uiLanguage,
    translationEn: spec.translation,
    hazardCandidates: [],
    missingInformation: [],
    uncertaintyNotes: [],
    mediaNotes: [],
    claimIds: [],
    validation: { errors: [], warnings: [], droppedClaims: 0, unverifiedExcerpts: 0, citationsChecked: 0, citationsRejected: 0 },
    embedding: spec.embedding,
    embeddingModel: "oracle",
  });
  await db.reports.update(report.id, { latestExtractionId: extractionId });

  const claims: Claim[] = [];
  for (const expected of spec.expectedClaims) {
    const located = expected.excerptText ? locateExcerpt(report.text, expected.excerptText) : null;
    const claim: Claim = {
      id: newId("clm"),
      reportId: report.id,
      extractionId,
      regionId: "np",
      type: expected.type,
      statement: expected.statement,
      statementEn: expected.statementEn,
      origin: "reporter",
      basis: "report_text",
      ...(expected.hazardCategory ? { hazardCategory: expected.hazardCategory } : {}),
      ...(expected.roadStatus ? { roadStatus: expected.roadStatus } : {}),
      ...(expected.roadName ? { roadName: expected.roadName } : {}),
      ...(expected.people ? { people: expected.people } : {}),
      ...(located && expected.excerptText
        ? { excerpt: { text: expected.excerptText, verified: located.verified, field: "text" as const, start: located.start, end: located.end } }
        : {}),
      review: { status: "unreviewed" },
      createdAt: report.submittedAt,
    };
    await db.claims.create(claim);
    claims.push(claim);
  }
  return claims;
}

/** Runs the real extraction, then reports what it produced. Gemini mode only. */
async function extractWithModel(
  db: Database,
  report: Report,
  llm: Llm,
  gazetteer: { datasetId: string; entries: GazetteerEntry[] } | null,
): Promise<Claim[]> {
  const region = getRegion(report.regionId);
  const outcome = await runExtraction({ report, media: [], region, gazetteer }, llm);
  await db.extractions.create(outcome.extraction);
  for (const claim of outcome.claims) await db.claims.create(claim);
  await db.reports.update(report.id, { latestExtractionId: outcome.extraction.id, status: outcome.extraction.status === "ok" ? "extracted" : "extraction_failed" });
  return outcome.claims;
}

/**
 * Writes a scenario's reports and their expected claims into a store, and returns the maps that
 * connect report keys to stored ids. Oracle mode uses this so that nothing has to be invented, and
 * the demo seed uses it too, one definition of the scenario, so the two cannot drift apart.
 */
export async function seedScenario(
  scenario: Scenario,
  db: Database,
): Promise<{ reportIdByKey: Map<string, string>; claimsByKey: Map<string, Claim[]> }> {
  const reportIdByKey = new Map<string, string>();
  const claimsByKey = new Map<string, Claim[]>();
  for (const spec of scenario.reports) {
    const report = buildReport(scenario, spec);
    await db.reports.create(report);
    reportIdByKey.set(spec.key, report.id);
    claimsByKey.set(spec.key, await seedExpectedClaims(db, report, spec));
  }
  return { reportIdByKey, claimsByKey };
}

/** Which report keys ended up sharing an incident. */
async function observedGroups(db: Database, keysByReportId: Map<string, string>): Promise<string[][]> {
  const incidents = await db.incidents.list({});
  return incidents
    .map((incident: Incident) => incident.reportIds.map((id) => keysByReportId.get(id)).filter((k): k is string => Boolean(k)).sort())
    .filter((group) => group.length > 0);
}

export async function runScenario(scenario: Scenario, mode: EvalMode, store: EvalStore, llm: Llm | null): Promise<ScenarioResult> {
  const notes: string[] = [];
  // Each scenario starts from empty, or the previous scenario's reports would be matched against.
  store.clear();
  const db = getDb();
  const keysByReportId = new Map<string, string>();
  const reportIdByKey = new Map<string, string>();
  const claimsByKey = new Map<string, Claim[]>();

  for (const spec of scenario.reports) {
    const report = buildReport(scenario, spec);
    await db.reports.create(report);
    keysByReportId.set(report.id, spec.key);
    reportIdByKey.set(spec.key, report.id);
    // Oracle mode writes the answer key in as if extraction had produced it; Gemini mode runs the
    // real thing and is scored against that same key.
    const claims =
      mode === "oracle" ? await seedExpectedClaims(db, report, spec) : await extractWithModel(db, report, llm!, null);
    claimsByKey.set(spec.key, claims);
  }

  // Matching runs in submission order, exactly as it does for live reports.
  const ordered = [...scenario.reports].sort((a, b) => a.offsetMinutes - b.offsetMinutes);
  for (const spec of ordered) {
    const id = reportIdByKey.get(spec.key)!;
    const result = await runMatchingForReport(id, mode === "gemini" ? llm : null, { rulesOnly: mode === "oracle" });
    notes.push(...result.notes);
  }

  // ---- grouping, over report pairs
  const groups = await observedGroups(db, keysByReportId);
  const groupOf = new Map<string, number>();
  groups.forEach((group, index) => group.forEach((key) => groupOf.set(key, index)));
  const shouldShare = new Set<string>();
  for (const group of scenario.expectations.groups) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) shouldShare.add(pairKey(group[i], group[j]));
  }
  const mustNot = new Set(scenario.expectations.mustNotMerge.map(([a, b]) => pairKey(a, b)));

  const allKeys = scenario.reports.map((r) => r.key);
  const falseMerges: string[] = [];
  const missed: string[] = [];
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  for (let i = 0; i < allKeys.length; i++) {
    for (let j = i + 1; j < allKeys.length; j++) {
      const key = pairKey(allKeys[i], allKeys[j]);
      const sameIncident = groupOf.get(allKeys[i]) !== undefined && groupOf.get(allKeys[i]) === groupOf.get(allKeys[j]);
      if (shouldShare.has(key) && sameIncident) truePositives++;
      else if (shouldShare.has(key)) {
        falseNegatives++;
        missed.push(key);
      } else if (sameIncident && mustNot.has(key)) {
        falsePositives++;
        falseMerges.push(key);
      }
    }
  }

  // ---- copy detection
  const suggestions = await db.suggestions.list({});
  const detectedCopies = new Set<string>();
  for (const suggestion of suggestions) {
    if (!suggestion.copySuspected) continue;
    const [a, b] = suggestion.reportIds.map((id) => keysByReportId.get(id) ?? "");
    if (a && b) detectedCopies.add(pairKey(a, b));
  }
  const expectedCopies = new Set(scenario.expectations.copies.map(([copy, original]) => pairKey(copy, original)));
  let copyTp = 0;
  let copyFp = 0;
  for (const key of detectedCopies) {
    if (expectedCopies.has(key)) copyTp++;
    else copyFp++;
  }
  let copyFn = 0;
  for (const key of expectedCopies) {
    if (!detectedCopies.has(key)) copyFn++;
  }

  // ---- contradictions
  const contradictions = await db.contradictions.list({});
  const foundKinds = contradictions.map((c) => ({
    kind: c.kind,
    keys: c.reportIds.map((id) => keysByReportId.get(id) ?? "").sort().join("~"),
  }));
  const missedContradictions: string[] = [];
  let contradictionsFound = 0;
  for (const expected of scenario.expectations.contradictions) {
    const key = [...expected.between].sort().join("~");
    // A contradiction counts when the kind matches and it involves both reports; extra reports on
    // the flag are fine, since one report can conflict with several.
    const hit = foundKinds.some((found) => found.kind === expected.kind && found.keys.includes(key));
    if (hit) contradictionsFound++;
    else missedContradictions.push(`${expected.kind} between ${expected.between.join(" and ")}`);
  }

  // ---- abstention: did the system decline to place a report it could not place?
  let abstainCorrect = 0;
  for (const key of scenario.expectations.abstain ?? []) {
    const reportId = reportIdByKey.get(key)!;
    const incident = groups.find((group) => group.includes(key));
    const isolated = incident?.length === 1;
    // "Abstained" means it was not merged with anything and it was never even compared.
    const compared = suggestions.some((s) => s.reportIds.includes(reportId));
    if (isolated && !compared) abstainCorrect++;
    else notes.push(`${key} should have been left alone but was ${compared ? "compared with other reports" : "grouped"}.`);
  }

  // ---- impact: confirm the road-blockage claims, run the analysis, check the expectations
  let impact: ScenarioResult["impact"];
  if (scenario.expectations.impact) {
    const memberIds = groups.flatMap((group) => group.map((k) => reportIdByKey.get(k)!));
    const incident = (await db.incidents.list({})).find((i) => i.reportIds.some((id) => memberIds.includes(id)));
    if (!incident) {
      impact = { ran: false, expectedLostAccess: scenario.expectations.impact.expectLostAccess ?? [], foundLostAccess: [], ok: false };
    } else {
      for (const reportId of incident.reportIds) {
        for (const claim of await db.claims.list({ where: [{ field: "reportId", op: "==", value: reportId }] })) {
          if (claim.roadStatus === "blocked") {
            await db.claims.update(claim.id, { review: { status: "confirmed", by: { id: "eval", name: "Evaluation" }, at: new Date().toISOString() } });
          }
        }
      }
      const assessment = await runImpactAssessment({ incidentId: incident.id, reviewer: { id: "eval", name: "Evaluation" }, llm: null, withExplanation: false });
      const lost = assessment.candidates.filter((c) => c.finding === "lost_access").map((c) => c.name);
      const expectedRoad = scenario.expectations.impact.expectBlockedRoad;
      const foundRoad = assessment.blockedRoads[0]?.name;
      const expectedLost = scenario.expectations.impact.expectLostAccess ?? [];
      const blockedRoadOk = expectedRoad ? Boolean(foundRoad?.toLowerCase().includes(expectedRoad.toLowerCase())) : undefined;
      const lostOk = expectedLost.every((name) => lost.includes(name));
      impact = {
        ran: true,
        status: assessment.status,
        blockedRoadOk,
        blockedRoadFound: foundRoad,
        expectedLostAccess: expectedLost,
        foundLostAccess: lost,
        ok: assessment.status === "ok" && blockedRoadOk !== false && lostOk,
      };
    }
  }

  // ---- extraction accuracy against the answer key (Gemini mode only)
  let extraction: ScenarioResult["extraction"];
  if (mode === "gemini") {
    let claimsCorrect = 0;
    let claimsTotal = 0;
    let hazardsCorrect = 0;
    let hazardsTotal = 0;
    let verified = 0;
    let excerptsTotal = 0;
    let dropped = 0;
    let checked = 0;
    let rejected = 0;
    for (const spec of scenario.reports) {
      const produced = claimsByKey.get(spec.key) ?? [];
      const report = await db.reports.get(reportIdByKey.get(spec.key)!);
      const record = report?.latestExtractionId ? await db.extractions.get(report.latestExtractionId) : null;
      dropped += record?.validation.droppedClaims ?? 0;
      checked += record?.validation.citationsChecked ?? 0;
      rejected += record?.validation.citationsRejected ?? 0;
      for (const expected of spec.expectedClaims) {
        claimsTotal++;
        const normalise = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        const hit = produced.some(
          (claim) => claim.type === expected.type && normalise(claim.statementEn || claim.statement).includes(normalise(expected.statementEn).slice(0, 24)),
        );
        if (hit) claimsCorrect++;
      }
      const expectedHazard = spec.expectedClaims.find((c) => c.expectedHazard)?.expectedHazard;
      if (expectedHazard) {
        hazardsTotal++;
        const hazardClaim = produced.find((c) => c.type === "hazard");
        if (hazardClaim?.hazardCategory === expectedHazard || report?.reporterHazard === expectedHazard) hazardsCorrect++;
      }
      for (const claim of produced) {
        if (!claim.excerpt) continue;
        excerptsTotal++;
        if (claim.excerpt.verified) verified++;
      }
    }
    extraction = {
      claims: { correct: claimsCorrect, total: claimsTotal },
      hazards: { correct: hazardsCorrect, total: hazardsTotal },
      excerptsVerified: { correct: verified, total: excerptsTotal },
      droppedClaims: dropped,
      citationsChecked: checked,
      citationsRejected: rejected,
    };
  }

  const pr = precisionRecall(truePositives, falsePositives, falseNegatives);
  const copyPr = precisionRecall(copyTp, copyFp, copyFn);

  return {
    id: scenario.id,
    name: scenario.name,
    mode,
    reports: scenario.reports.length,
    grouping: {
      truePositives,
      falsePositives,
      falseNegatives,
      precision: pr.precision,
      recall: pr.recall,
      falseMerges,
      missed,
    },
    copies: { truePositives: copyTp, falsePositives: copyFp, falseNegatives: copyFn, precision: copyPr.precision, recall: copyPr.recall },
    contradictions: {
      found: contradictionsFound,
      expected: scenario.expectations.contradictions.length,
      recall: rate(contradictionsFound, scenario.expectations.contradictions.length),
      missed: missedContradictions,
    },
    abstention: { correct: abstainCorrect, total: (scenario.expectations.abstain ?? []).length },
    impact,
    extraction,
    notes: [...new Set(notes)],
  };
}

export async function runEvaluation(
  mode: EvalMode,
  store: EvalStore,
  llm: Llm | null,
  /**
   * Run only these scenario ids. Gemini mode is the reason this exists: a full run makes roughly
   * forty to fifty-five model requests, and a metered key allows a fraction of that per day. Running
   * one scenario at a time turns a run that would die partway — producing a result that looks
   * complete and is not — into several runs that each finish and say exactly what they covered.
   */
  scenarioIds?: string[],
): Promise<EvalReport> {
  if (mode === "gemini" && !llm) {
    throw new AiUnavailableError();
  }

  const chosen = scenarioIds?.length ? SCENARIOS.filter((s) => scenarioIds.includes(s.id)) : SCENARIOS;
  if (scenarioIds?.length && chosen.length !== scenarioIds.length) {
    const missing = scenarioIds.filter((id) => !SCENARIOS.some((s) => s.id === id));
    throw new Error(`No such scenario: ${missing.join(", ")}. Available: ${SCENARIOS.map((s) => s.id).join(", ")}`);
  }

  const results: ScenarioResult[] = [];
  for (const scenario of chosen) {
    results.push(await runScenario(scenario, mode, store, llm));
  }

  const sum = (pick: (r: ScenarioResult) => number) => results.reduce((total, r) => total + pick(r), 0);
  const tp = sum((r) => r.grouping.truePositives);
  const fp = sum((r) => r.grouping.falsePositives);
  const fn = sum((r) => r.grouping.falseNegatives);
  const copyTp = sum((r) => r.copies.truePositives);
  const copyFp = sum((r) => r.copies.falsePositives);
  const copyFn = sum((r) => r.copies.falseNegatives);
  const contradictionsFound = sum((r) => r.contradictions.found);
  const contradictionsExpected = sum((r) => r.contradictions.expected);

  const status = aiStatus();
  return {
    generatedAt: new Date().toISOString(),
    mode,
    model: mode === "oracle" ? "none (oracle mode)" : status.models.extraction,
    promptVersions: { ...PROMPT_VERSIONS },
    aiConfigured: status.configured,
    scenarios: results,
    totals: {
      grouping: { ...precisionRecall(tp, fp, fn), falseMerges: fp, missed: fn },
      copies: precisionRecall(copyTp, copyFp, copyFn),
      contradictions: { found: contradictionsFound, expected: contradictionsExpected, recall: rate(contradictionsFound, contradictionsExpected) },
      abstention: { correct: sum((r) => r.abstention.correct), total: sum((r) => r.abstention.total) },
      impact: { checked: results.filter((r) => r.impact?.ran).length, ok: results.filter((r) => r.impact?.ok).length },
    },
    caveat:
      "A small, hand-written set of scenarios over real road geography. It shows the pipeline behaves as designed on cases we chose; it is not a measure of real-world effectiveness, and no such claim should be read from it.",
  };
}
