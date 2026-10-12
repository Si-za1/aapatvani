import "server-only";

// Alert drafting (project.md §8.5, features M11/S2).
//
// The app never sends anything. A draft is built only from facts a reviewer has confirmed, every
// sentence must cite its sources, and the draft stays a draft until a named reviewer approves it.
// The sentence-level citation and number checks live in lib/ai/alerts.ts; this file decides what
// the model is allowed to see and records the decision.

import { getRegion } from "@/config/regions";
import { aiActor, humanActor, recordAudit } from "@/lib/audit";
import { draftAlert, alertReadiness, type AlertInput } from "@/lib/ai/alerts";
import { AiUnavailableError, type Llm } from "@/lib/ai/types";
import { getDb } from "@/lib/db";
import type { AlertDraft, Claim, Contradiction } from "@/lib/domain/schemas";
import { newId } from "@/lib/ids";
import { confirmedCandidates, latestAssessment } from "@/lib/impact/service";
import type { Reviewer } from "@/lib/review/service";

/** Claims a draft may use: the reporter's, the model's, or a reviewer's — but only once confirmed. */
const CONFIRMED = new Set(["confirmed", "edited"]);

export class AlertNotReadyError extends Error {}

export interface DraftAlertInput {
  incidentId: string;
  reviewer: Reviewer;
  llm: Llm | null;
  languages: Array<"en" | "ne">;
}

export async function draftAlertForIncident(input: DraftAlertInput): Promise<AlertDraft> {
  const db = getDb();
  const incident = await db.incidents.get(input.incidentId);
  if (!incident) throw new Error(`Incident ${input.incidentId} not found`);

  const reports = await db.reports.getMany(incident.reportIds);
  const claims: Claim[] = await db.claims.list({ where: [{ field: "reportId", op: "in", value: incident.reportIds }] });
  const usable = claims.filter((c) => c.review.status !== "rejected");

  // Readiness is checked before the model is: it is something the reviewer can act on, and it is the
  // same answer whether or not this deployment has Gemini configured.
  const readiness = alertReadiness({ claims: usable });
  if (!readiness.ready) throw new AlertNotReadyError(readiness.reason ?? "This incident is not ready for a draft.");
  if (!input.llm) throw new AiUnavailableError();

  const [assessment, contradictions] = await Promise.all([
    latestAssessment(incident.id),
    db.contradictions.list({ where: [{ field: "incidentId", op: "==", value: incident.id }] }),
  ]);
  const openContradictions = contradictions.filter((c) => c.status === "open");

  // What the reports themselves say is still missing — the honest "we do not know yet" list.
  const unknowns: string[] = [];
  for (const report of reports) {
    if (!report.latestExtractionId) continue;
    const extraction = await db.extractions.get(report.latestExtractionId);
    for (const item of extraction?.missingInformation ?? []) unknowns.push(item);
  }

  const alertInput: AlertInput = {
    region: getRegion(incident.regionId),
    incident,
    claims: usable,
    impacts: confirmedCandidates(assessment),
    contradictions: openContradictions,
    unknowns: [...new Set(unknowns)].slice(0, 10),
    languages: input.languages,
    locationLabel: incident.location?.label,
    reportTimes: Object.fromEntries(reports.map((r) => [r.id, r.submittedAt])),
  };

  const outcome = await draftAlert(alertInput, input.llm);

  const previous = await db.alerts.list({ where: [{ field: "incidentId", op: "==", value: incident.id }] });
  const draft: AlertDraft = {
    id: newId("alr"),
    incidentId: incident.id,
    regionId: incident.regionId,
    version: previous.length + 1,
    createdAt: new Date().toISOString(),
    createdBy: { id: input.reviewer.id, name: input.reviewer.name },
    model: outcome.model,
    promptVersion: outcome.promptVersion,
    languages: input.languages,
    sections: outcome.sections,
    sources: outcome.sources,
    validation: outcome.validation,
    status: "draft",
  };

  const saved = await db.alerts.create(draft);
  // An approved or drafted earlier version is no longer the current draft.
  for (const old of previous) {
    if (old.status === "draft") await db.alerts.update(old.id, { status: "superseded" });
  }
  await db.incidents.update(incident.id, { latestAlertId: saved.id });

  await recordAudit({
    actor: aiActor(outcome.model),
    action: "alert.drafted",
    targetType: "alert",
    targetId: saved.id,
    incidentId: incident.id,
    summary: `Alert draft v${saved.version} created by ${input.reviewer.name} from ${outcome.sources.claimIds.length} confirmed claim(s) and ${outcome.sources.impactCandidateIds.length} confirmed impact(s).`,
    ...(outcome.validation.removedSentences
      ? { note: `${outcome.validation.removedSentences} sentence(s) were dropped for missing or unsupported citations.` }
      : {}),
  });
  return saved;
}

/**
 * A reviewer approves or rejects a draft. Approval marks it approved for the record — it is still
 * never sent anywhere, and the incident keeps the citation trail.
 */
export async function decideAlert(
  alertId: string,
  decision: "approved" | "rejected",
  reviewer: Reviewer,
  note?: string,
): Promise<AlertDraft> {
  const db = getDb();
  const before = await db.alerts.get(alertId);
  if (!before) throw new Error(`Alert draft ${alertId} not found`);

  const updated = await db.alerts.update(alertId, {
    status: decision,
    decision: { by: reviewer.id, byName: reviewer.name, at: new Date().toISOString(), ...(note ? { note } : {}) },
  });

  await recordAudit({
    actor: humanActor(reviewer.id, reviewer.name),
    action: `alert.${decision}`,
    targetType: "alert",
    targetId: alertId,
    incidentId: before.incidentId,
    summary: `Alert draft v${before.version} ${decision} by ${reviewer.name}. Nothing was sent.`,
    note,
    before: { status: before.status },
    after: { status: decision },
  });
  return updated;
}

/** The current draft for an incident, if there is one. */
export async function latestAlert(incidentId: string): Promise<AlertDraft | null> {
  const db = getDb();
  const incident = await db.incidents.get(incidentId);
  if (!incident?.latestAlertId) return null;
  return db.alerts.get(incident.latestAlertId);
}

/** Open contradictions for an incident, for the reviewer's view. */
export async function openContradictions(incidentId: string): Promise<Contradiction[]> {
  const db = getDb();
  const all = await db.contradictions.list({ where: [{ field: "incidentId", op: "==", value: incidentId }] });
  return all.filter((c) => c.status === "open");
}

export { CONFIRMED as CONFIRMED_CLAIM_STATUSES };
