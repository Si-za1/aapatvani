import "server-only";

// Impact assessment (project.md §8.4, features M9/S5/S7).
//
// The geography is entirely deterministic: lib/geo/blast-radius.ts computes which settlements and
// facilities may lose road access, and this file only gathers the inputs, stores a versioned record
// and (optionally) asks Gemini to restate the result in plain language. Gemini never sees the graph
// and can never add a finding.
//
// "Not necessarily safe" is not decoration: every assessment carries it, because an area outside
// the dataset has not been checked, which is not the same as being unaffected.

import { getRegion } from "@/config/regions";
import { aiActor, humanActor, recordAudit, systemActor } from "@/lib/audit";
import { getDb } from "@/lib/db";
import type { ImpactAssessment, ImpactCandidate, ReviewDecision, ReviewStatus } from "@/lib/domain/schemas";
import { newId, stableId } from "@/lib/ids";
import { analyzeBlastRadius, DEFAULT_BLAST_RADIUS_PARAMS, type BlockageInput } from "@/lib/geo/blast-radius";
import { datasetsForRegion } from "@/lib/geo/dataset";
import { explainImpact } from "@/lib/ai/explain";
import { AiCallError, AiOutputError, AiUnavailableError, type Llm } from "@/lib/ai/types";
import type { Reviewer } from "@/lib/review/service";

/** Road statuses that describe an obstruction. Only these trigger an access analysis. */
const BLOCKING_STATUS = new Set(["blocked", "partially_blocked", "damaged"]);

export const NOT_SAFE_NOTICE = "Places outside this analysis are not necessarily safe: they have not been checked, which is not the same as being unaffected.";

export interface RunImpactInput {
  incidentId: string;
  reviewer: Reviewer;
  llm: Llm | null;
  /** Ask Gemini for a plain-language restatement after the analysis. */
  withExplanation?: boolean;
}

export async function runImpactAssessment(input: RunImpactInput): Promise<ImpactAssessment> {
  const db = getDb();
  const incident = await db.incidents.get(input.incidentId);
  if (!incident) throw new Error(`Incident ${input.incidentId} not found`);

  const claims = await db.claims.list({ where: [{ field: "reportId", op: "in", value: incident.reportIds }] });
  const usable = claims.filter((c) => c.review.status !== "rejected");
  const blockageClaims = usable.filter((c) => c.roadStatus && BLOCKING_STATUS.has(c.roadStatus));
  const blockage: BlockageInput | null = blockageClaims.length
    ? {
        claimIds: blockageClaims.map((c) => c.id),
        claimStatus: Object.fromEntries(blockageClaims.map((c) => [c.id, c.review.status])),
        roadNames: [...new Set(blockageClaims.map((c) => c.roadName).filter((n): n is string => Boolean(n)))],
      }
    : null;

  const previous = await db.impacts.list({ where: [{ field: "incidentId", op: "==", value: incident.id }] });
  const version = previous.length + 1;
  const base = {
    id: newId("imp"),
    incidentId: incident.id,
    regionId: incident.regionId,
    version,
    createdAt: new Date().toISOString(),
    createdBy: { id: input.reviewer.id, name: input.reviewer.name },
    inputs: {
      location: incident.location,
      blockageClaimIds: blockage?.claimIds ?? [],
      blockageClaimStatus: blockage?.claimStatus ?? {},
      roadNames: blockage?.roadNames ?? [],
      params: { ...DEFAULT_BLAST_RADIUS_PARAMS },
    },
  };

  const unavailable = (status: ImpactAssessment["status"], statusMessage: string, warnings: string[]): ImpactAssessment => ({
    ...base,
    status,
    statusMessage,
    blockedRoads: [],
    otherNearbyRoads: [],
    candidates: [],
    stats: {},
    warnings,
    limitations: [NOT_SAFE_NOTICE],
  });

  if (!incident.location) {
    const saved = await db.impacts.create(
      unavailable("no_location", "This incident has no location yet, so no road analysis could be run.", [
        "Set the incident location from a report, or confirm a report that places it, and run the analysis again.",
      ]),
    );
    await finish(input, saved);
    return saved;
  }

  const datasets = await datasetsForRegion(incident.regionId, { lat: incident.location.lat, lng: incident.location.lng });
  if (!datasets.length) {
    const saved = await db.impacts.create(
      unavailable("outside_dataset", "The incident is outside the area covered by the road dataset.", [
        "No road data covers this point. Nothing about access here can be concluded from this tool.",
      ]),
    );
    await finish(input, saved);
    return saved;
  }

  const dataset = datasets[0];
  const result = analyzeBlastRadius({
    graph: dataset.graph,
    assets: dataset.assets,
    manifest: dataset.manifest,
    incident: { lat: incident.location.lat, lng: incident.location.lng, uncertaintyM: incident.location.uncertaintyM },
    blockage,
  });

  // Review decisions carry across versions, so re-running the analysis does not lose a reviewer's work.
  const carriedReviews = new Map<string, ReviewDecision>();
  for (const past of previous) for (const c of past.candidates) carriedReviews.set(c.id, c.review);

  const candidates: ImpactCandidate[] = result.candidates.map((c) => ({
    ...c,
    id: stableId("cand", incident.id, c.key),
    review: carriedReviews.get(stableId("cand", incident.id, c.key)) ?? { status: "unreviewed" },
  }));

  const warnings = [...result.warnings];
  if (!blockage) {
    warnings.push("No confirmed or reported road blockage was found among this incident's claims, so no road is assumed to be blocked. The map shows what is nearby.");
  }

  const assessment: ImpactAssessment = {
    ...base,
    dataset: {
      id: dataset.manifest.id,
      name: dataset.manifest.name,
      snapshot: dataset.manifest.snapshot,
      license: dataset.manifest.license,
      attribution: dataset.manifest.attribution,
    },
    status: result.status,
    statusMessage: result.statusMessage,
    blockedRoads: result.blockedEdges.map((e) => ({ edge: e.edge, name: e.name, roadClass: e.roadClass, distanceM: e.distanceM, lengthM: e.lengthM })),
    otherNearbyRoads: result.otherNearbyRoads.map((e) => ({ edge: e.edge, name: e.name, roadClass: e.roadClass, distanceM: e.distanceM })),
    candidates,
    stats: { ...result.stats },
    warnings: [...warnings, ...dataset.manifest.knownLimitations],
    limitations: [NOT_SAFE_NOTICE],
  };

  if (input.withExplanation && input.llm && candidates.length) {
    assessment.aiExplanation = await explain(assessment, incident.regionId, input.llm);
  }

  const saved = await db.impacts.create(assessment);
  await finish(input, saved);
  return saved;
}

async function explain(
  assessment: ImpactAssessment,
  regionId: string,
  llm: Llm,
): Promise<NonNullable<ImpactAssessment["aiExplanation"]>> {
  try {
    const outcome = await explainImpact(assessment, getRegion(regionId), llm);
    return {
      text: outcome.text,
      model: outcome.model,
      promptVersion: outcome.promptVersion,
      citedCandidateIds: outcome.citedCandidateIds,
      accepted: outcome.accepted,
      ...(outcome.rejectionReason ? { rejectionReason: outcome.rejectionReason } : {}),
    };
  } catch (err) {
    if (err instanceof AiUnavailableError || err instanceof AiCallError || err instanceof AiOutputError) {
      return {
        text: "",
        model: "none",
        promptVersion: "explain-v1",
        citedCandidateIds: [],
        accepted: false,
        rejectionReason: `No explanation was produced (${err.message}).`,
      };
    }
    throw err;
  }
}

async function finish(input: RunImpactInput, saved: ImpactAssessment): Promise<void> {
  const db = getDb();
  await db.incidents.update(input.incidentId, { latestImpactId: saved.id });
  await recordAudit({
    actor: input.llm && saved.aiExplanation ? aiActor(saved.aiExplanation.model) : systemActor(),
    action: "impact.assessed",
    targetType: "impact",
    targetId: saved.id,
    incidentId: input.incidentId,
    summary: `Impact analysis v${saved.version} run by ${input.reviewer.name}: ${saved.statusMessage}`,
    after: { status: saved.status, candidates: saved.candidates.length },
  });
}

/**
 * Confirms or dismisses one candidate finding. Confirmations are what an alert draft may draw on;
 * a dismissed candidate is kept but never cited.
 *
 * The product language is confirm/dismiss; the stored review status is the shared one, where a
 * dismissal is a rejection.
 */
export async function reviewImpactCandidate(
  assessmentId: string,
  candidateId: string,
  decision: "confirmed" | "dismissed" | "needs_info",
  reviewer: Reviewer,
  note?: string,
): Promise<ImpactAssessment> {
  const db = getDb();
  const assessment = await db.impacts.get(assessmentId);
  if (!assessment) throw new Error(`Impact assessment ${assessmentId} not found`);

  const target = assessment.candidates.find((c) => c.id === candidateId);
  if (!target) throw new Error(`Candidate ${candidateId} not found in this assessment`);

  const status: ReviewStatus = decision === "dismissed" ? "rejected" : decision;
  const review: ReviewDecision = {
    status,
    by: { id: reviewer.id, name: reviewer.name },
    at: new Date().toISOString(),
    ...(note ? { note } : {}),
  };
  const updated = await db.impacts.update(assessmentId, {
    candidates: assessment.candidates.map((c) => (c.id === candidateId ? { ...c, review } : c)),
  });

  await recordAudit({
    actor: humanActor(reviewer.id, reviewer.name),
    action: `impact.${decision}`,
    targetType: "impact",
    targetId: assessmentId,
    incidentId: assessment.incidentId,
    summary: `Impact finding "${target.name}" ${decision.replace("_", " ")} by ${reviewer.name}.`,
    note,
    before: { status: target.review.status },
    after: { status },
  });
  return updated;
}

/** The current (latest) assessment for an incident. */
export async function latestAssessment(incidentId: string): Promise<ImpactAssessment | null> {
  const db = getDb();
  const incident = await db.incidents.get(incidentId);
  if (!incident?.latestImpactId) return null;
  return db.impacts.get(incident.latestImpactId);
}

/** Impact candidates a reviewer has confirmed, the only ones an alert draft may cite. */
export function confirmedCandidates(assessment: ImpactAssessment | null): ImpactCandidate[] {
  if (!assessment) return [];
  return assessment.candidates.filter((c) => c.review.status === "confirmed" || c.review.status === "edited");
}
