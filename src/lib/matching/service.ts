import "server-only";

// Runs matching for one report (project.md §6 step 3, §8.2, §8.3).
//
// Order of work:
//   1. deterministic candidate filter (region, time, distance, hazard), cheap, no model calls
//   2. lexical + embedding similarity and copy detection
//   3. one Gemini comparison per surviving pair (skipped when Gemini is not configured)
//   4. incident assignment
//   5. contradiction detection across the incident's members
//
// Matching is useful without Gemini: steps 1, 2, 4 and the rule half of 5 are deterministic, so a
// deployment with no model credentials still groups and flags. The comparison then reports itself
// as unavailable, and nothing pretends a model looked at it.

import { getRegion, type RegionConfig } from "@/config/regions";
import { aiActor, recordAudit, systemActor } from "@/lib/audit";
import { AiCallError, AiOutputError, AiUnavailableError, type Llm } from "@/lib/ai/types";
import { compareReports } from "@/lib/ai/compare";
import { getDb, type Database } from "@/lib/db";
import type { Contradiction, Extraction, Incident, Report, ReportStatus, Suggestion } from "@/lib/domain/schemas";
import { stableId } from "@/lib/ids";
import { addMember, createCandidateIncident, recomputeIncident } from "@/lib/incidents/service";
import { candidateVerdict, orderedPair, pairContext, pairFeatures, type PairContext, type ReportPoint } from "./candidates";
import {
  aiContradiction,
  contradictionFingerprint,
  contradictionId,
  dedupeDrafts,
  pairContradictions,
  reportSelfContradictions,
  type ContradictionDraft,
} from "./contradictions";
import { detectCopy } from "./copies";
import { scorePair } from "./scoring";
import { cosineSimilarity, reportVerbatimText, shingleSimilarity, usableClaims } from "./similarity";

export interface SkippedPair {
  reportId: string;
  reason: string;
}

export interface MatchRunResult {
  reportId: string;
  incident: Incident | null;
  suggestions: Suggestion[];
  contradictions: Contradiction[];
  comparedWithModel: number;
  aiAvailable: boolean;
  skipped: SkippedPair[];
  notes: string[];
}

export interface MatchOptions {
  /** Only consider reports submitted within this many hours. Defaults to no extra limit. */
  maxAgeHours?: number;
  /** Use the deterministic signals only, even when a model is available. */
  rulesOnly?: boolean;
}

interface Side {
  context: PairContext;
  extraction: Extraction | undefined;
}

/** A pair the system believes is a copy, with the direction resolved: the later report copies the earlier one. */
interface CopyLink {
  copyId: string;
  originalId: string;
  reasons: string[];
}

export function suggestionIdFor(a: string, b: string): string {
  const [first, second] = orderedPair(a, b);
  return stableId("sug", first, second);
}

async function loadSide(db: Database, report: Report): Promise<Side> {
  const claims = usableClaims(await db.claims.list({ where: [{ field: "reportId", op: "==", value: report.id }] }));
  const extraction = report.latestExtractionId ? ((await db.extractions.get(report.latestExtractionId)) ?? undefined) : undefined;
  return { context: pairContext(report, claims), extraction };
}

/** A report is only worth comparing once extraction has had its turn. */
export function matchableStatus(status: ReportStatus): boolean {
  return status === "extracted" || status === "extraction_failed" || status === "ai_unavailable";
}

export async function runMatchingForReport(
  reportId: string,
  llm: Llm | null,
  options: MatchOptions = {},
): Promise<MatchRunResult> {
  const db = getDb();
  const report = await db.reports.get(reportId);
  if (!report) throw new Error(`Report ${reportId} not found`);
  const region = getRegion(report.regionId);

  const own = await loadSide(db, report);
  const notes: string[] = [];
  const suggestions: Suggestion[] = [];
  const skipped: SkippedPair[] = [];
  const aiDrafts: ContradictionDraft[] = [];
  const copyLinks = new Map<string, CopyLink>();
  let comparedWithModel = 0;

  const others = (await db.reports.list({ where: [{ field: "regionId", op: "==", value: report.regionId }] })).filter(
    (r) => r.id !== report.id,
  );

  // Steps 1–3: compare against every other report in the region.
  for (const other of others) {
    if (options.maxAgeHours !== undefined) {
      const gap = Math.abs(Date.parse(other.submittedAt) - Date.parse(report.submittedAt)) / 3_600_000;
      if (gap > options.maxAgeHours) {
        skipped.push({ reportId: other.id, reason: `more than ${options.maxAgeHours} h apart` });
        continue;
      }
    }

    const side = await loadSide(db, other);
    const features = pairFeatures(own.context, side.context, region);
    const verdict = candidateVerdict(own.context, side.context, region, features);
    if (!verdict.candidate) {
      skipped.push({ reportId: other.id, reason: verdict.reason });
      continue;
    }

    const lexical = shingleSimilarity(
      reportVerbatimText(report, own.extraction),
      reportVerbatimText(other, side.extraction),
    );
    const semantic = cosineSimilarity(own.extraction?.embedding, side.extraction?.embedding);
    const scored = scorePair({ ...features, semanticSimilarity: semantic }, lexical);
    const copy = detectCopy(report, other, lexical, features);

    if (copy.suspected) {
      // The later submission is the copy; the earlier report is the one it copies.
      const reportIsLater = Date.parse(report.submittedAt) >= Date.parse(other.submittedAt);
      copyLinks.set(other.id, {
        copyId: reportIsLater ? report.id : other.id,
        originalId: reportIsLater ? other.id : report.id,
        reasons: copy.reasons,
      });
    }

    const [first, second] = orderedPair(report.id, other.id);
    const id = suggestionIdFor(report.id, other.id);
    const existing = await db.suggestions.get(id);
    if (existing && existing.status !== "pending") {
      // A reviewer already decided this pair. Leave their decision alone.
      suggestions.push(existing);
      continue;
    }

    const suggestion: Suggestion = {
      id,
      regionId: report.regionId,
      reportIds: [first, second],
      features: {
        distanceKm: features.distanceKm,
        effectiveDistanceKm: features.effectiveDistanceKm,
        hoursApart: features.hoursApart,
        hazardMatch: features.hazardMatch,
        semanticSimilarity: semantic,
        lexicalSimilarity: lexical,
        sharedMedia: features.sharedMedia,
        sameReporter: features.sameReporter,
        unavailable: scored.unavailable,
      },
      score: scored.total,
      copySuspected: copy.suspected,
      copyReasons: copy.reasons,
      status: "pending",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    if (!options.rulesOnly && llm && !copy.suspected) {
      // No model call for a copy: the copy link is already the finding, and asking would spend a
      // request to be told the two texts are the same.
      try {
        const outcome = await compareReports(
          { report, claims: own.context.claims },
          { report: other, claims: side.context.claims },
          {
            distanceKm: features.distanceKm,
            hoursApart: features.hoursApart,
            hazardMatch: features.hazardMatch,
            sharedMedia: features.sharedMedia,
            sameReporter: features.sameReporter,
          },
          region,
          llm,
        );
        comparedWithModel++;
        suggestion.ai = {
          verdict: outcome.verdict,
          rationale: outcome.rationale,
          agreements: outcome.agreements,
          conflicts: outcome.conflicts,
          missing: outcome.missing,
          copySignals: outcome.copySignals,
          model: outcome.model,
          promptVersion: outcome.promptVersion,
          citationsRejected: outcome.citationsRejected,
        };
        for (const conflict of outcome.conflicts) {
          aiDrafts.push(aiContradiction(conflict, [first, second], outcome.model));
        }
      } catch (err) {
        if (err instanceof AiUnavailableError) {
          notes.push("Gemini is not configured, so reports were compared on computed features only.");
        } else if (err instanceof AiCallError || err instanceof AiOutputError) {
          notes.push(`Comparison with ${other.referenceCode} failed (${err.message}); its features are still shown.`);
        } else {
          throw err;
        }
      }
    }

    const stored = existing ? await db.suggestions.set(suggestion) : await db.suggestions.create(suggestion);
    suggestions.push(stored);
    await recordAudit({
      actor: systemActor(),
      action: "suggestion.created",
      targetType: "suggestion",
      targetId: stored.id,
      reportId: report.id,
      summary: `Candidate match with ${other.referenceCode} (score ${Math.round(stored.score * 100)}%).`,
      after: { score: stored.score, verdict: stored.ai?.verdict },
    });
  }

  // Step 4: incident assignment.
  const incident = await assignIncident(db, report, own.context.point, own.context.hazard, suggestions, copyLinks, notes);

  // Step 5: contradictions across the incident's members.
  const contradictions = incident ? await refreshContradictions(db, incident, aiDrafts, region) : [];
  if (incident) await recomputeIncident(incident.id);

  return {
    reportId,
    incident: incident ? await db.incidents.get(incident.id) : null,
    suggestions,
    contradictions,
    comparedWithModel,
    aiAvailable: Boolean(llm) && !options.rulesOnly,
    skipped,
    notes,
  };
}

/**
 * Puts the report into an incident. If a candidate match points at a report that is already in a
 * candidate incident, this report joins it, as a suggestion, never as a decision. The best-scoring
 * link wins when several incidents compete.
 */
async function assignIncident(
  db: Database,
  report: Report,
  point: ReportPoint | null,
  hazard: string | undefined,
  suggestions: Suggestion[],
  copyLinks: Map<string, CopyLink>,
  notes: string[],
): Promise<Incident | null> {
  if (report.incidentId) {
    const current = await db.incidents.get(report.incidentId);
    if (current) return current;
  }

  const links = suggestions.filter((s) => s.status !== "rejected").sort((a, b) => b.score - a.score);

  for (const link of links) {
    const otherId = link.reportIds.find((id) => id !== report.id);
    if (!otherId) continue;
    const other = await db.reports.get(otherId);
    if (!other?.incidentId) continue;
    const incident = await db.incidents.get(other.incidentId);
    if (!incident || incident.status === "dismissed") continue;

    // A copy joins the incident, but linked to the report it copies rather than standing alone.
    const copy = copyLinks.get(otherId);
    return addMember({
      incidentId: incident.id,
      report,
      addedBy: "system",
      membership: "suggested",
      ...(copy ? { copyOf: copy.originalId, copyReasons: copy.reasons } : {}),
    });
  }

  if (links.length) {
    notes.push("Matches were found, but none of the other reports is in an incident yet; a new candidate incident was opened.");
  }
  if (point === null) {
    notes.push("This report has no usable location (no GPS, no pin, no recognised place name), so it was not compared with other reports.");
  }
  return createCandidateIncident({
    regionId: report.regionId,
    dataLabel: report.dataLabel,
    report,
    point,
    hazard,
    createdBy: "system",
  });
}

/**
 * Recomputes the incident's contradictions from its members' current claims, plus any conflicts the
 * model reported. A contradiction a reviewer already resolved or dismissed is never re-opened.
 */
async function refreshContradictions(
  db: Database,
  incident: Incident,
  aiDrafts: ContradictionDraft[],
  region: RegionConfig,
): Promise<Contradiction[]> {
  const reports = await db.reports.getMany(incident.reportIds);
  const contexts: PairContext[] = [];
  for (const report of reports) {
    const claims = usableClaims(await db.claims.list({ where: [{ field: "reportId", op: "==", value: report.id }] }));
    contexts.push(pairContext(report, claims));
  }

  const drafts: ContradictionDraft[] = [];
  for (const ctx of contexts) drafts.push(...reportSelfContradictions(ctx));
  for (let i = 0; i < contexts.length; i++) {
    for (let j = i + 1; j < contexts.length; j++) {
      drafts.push(...pairContradictions(contexts[i], contexts[j], pairFeatures(contexts[i], contexts[j], region)));
    }
  }

  // Only model conflicts about reports that are actually in this incident.
  const memberIds = new Set(incident.reportIds);
  for (const draft of aiDrafts) {
    if (draft.reportIds.every((id) => memberIds.has(id))) drafts.push(draft);
  }

  const stored: Contradiction[] = [];
  for (const draft of dedupeDrafts(drafts)) {
    const id = contradictionId(draft);
    const existing = await db.contradictions.get(id);
    if (existing && existing.status !== "open") {
      // A reviewer has ruled on this already; their decision stands.
      stored.push(existing);
      continue;
    }
    const record: Contradiction = {
      id,
      regionId: incident.regionId,
      incidentId: incident.id,
      reportIds: [...draft.reportIds].sort(),
      claimIds: [...draft.claimIds].sort(),
      kind: draft.kind,
      detectedBy: draft.detectedBy,
      description: draft.description,
      fingerprint: contradictionFingerprint(draft),
      status: "open",
      ...(draft.model ? { model: draft.model } : {}),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    const saved = existing ? await db.contradictions.set(record) : await db.contradictions.create(record);
    stored.push(saved);
    if (!existing) {
      await recordAudit({
        actor: draft.detectedBy === "ai" ? aiActor(draft.model ?? "gemini") : systemActor(),
        action: "contradiction.flagged",
        targetType: "contradiction",
        targetId: saved.id,
        incidentId: incident.id,
        summary: draft.description,
      });
    }
  }
  return stored;
}
