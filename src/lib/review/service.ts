import "server-only";

// Reviewer decisions (features M4, M5, M6). This is the only place where "confirmed" comes from:
// every function here is called on behalf of a named signed-in person, and every one writes an
// audit event.
//
// The rule that shapes all of it: a similarity score never merges anything, and a model verdict
// never merges anything. Only these calls do, and only a human makes them.

import { humanActor, recordAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import type { Claim, Contradiction, Incident, Report, ReviewStatus, Suggestion } from "@/lib/domain/schemas";
import {
  createCandidateIncident,
  incidentOfReport,
  mergeReport,
  recomputeIncident,
  reviewMembership,
  separateReport,
} from "@/lib/incidents/service";

export interface Reviewer {
  id: string;
  name: string;
}

export interface ClaimReviewInput {
  status: ReviewStatus;
  note?: string;
  /** A reviewer's correction. Kept beside the model's statement, never replacing it. */
  editedStatement?: string;
}

/**
 * Confirms, edits, rejects or asks for more information on one claim. The original model output and
 * the reporter's words are never modified, a reviewer's correction lives in `editedStatement`.
 */
export async function reviewClaim(claimId: string, input: ClaimReviewInput, reviewer: Reviewer): Promise<Claim> {
  const db = getDb();
  const before = await db.claims.get(claimId);
  if (!before) throw new Error(`Claim ${claimId} not found`);

  const updated = await db.claims.update(claimId, {
    review: {
      status: input.status,
      by: { id: reviewer.id, name: reviewer.name },
      at: new Date().toISOString(),
      ...(input.note ? { note: input.note } : {}),
    },
    ...(input.editedStatement !== undefined ? { editedStatement: input.editedStatement } : {}),
  });

  await recordAudit({
    actor: humanActor(reviewer.id, reviewer.name),
    action: `claim.${input.status}`,
    targetType: "claim",
    targetId: claimId,
    reportId: before.reportId,
    summary: `Claim ${input.status.replace("_", " ")} by ${reviewer.name}.`,
    note: input.note,
    before: { status: before.review.status, statement: before.statementEn },
    after: { status: input.status, statement: input.editedStatement ?? updated.statementEn },
  });
  return updated;
}

/** Recomputes an incident's derived counters after a decision that touches it. */
async function touchIncident(incidentId: string | undefined): Promise<void> {
  if (incidentId) await recomputeIncident(incidentId);
}

/** The incident holding this report, creating one if the report has none yet. */
async function hostIncidentFor(report: Report, reviewer: Reviewer): Promise<Incident> {
  const existing = await incidentOfReport(report.id);
  if (existing) return existing;
  return createCandidateIncident({
    regionId: report.regionId,
    dataLabel: report.dataLabel,
    report,
    point: null,
    hazard: report.reporterHazard,
    createdBy: reviewer.id,
  });
}

/**
 * A reviewer accepts or rejects a suggested match.
 *
 * Accepting puts both reports in one incident, moving either of them out of wherever it was.
 * Rejecting separates them if they happen to sit together, and leaves the decision on the record so
 * that re-running matching will not resurrect the suggestion.
 */
export async function decideSuggestion(
  suggestionId: string,
  input: { decision: "accepted" | "rejected"; note?: string },
  reviewer: Reviewer,
): Promise<{ suggestion: Suggestion; incident: Incident | null }> {
  const db = getDb();
  const suggestion = await db.suggestions.get(suggestionId);
  if (!suggestion) throw new Error(`Suggestion ${suggestionId} not found`);

  const [firstId, secondId] = suggestion.reportIds;
  const first = await db.reports.get(firstId);
  const second = await db.reports.get(secondId);
  if (!first || !second) throw new Error("One of the reports in this suggestion no longer exists.");

  const updated = await db.suggestions.update(suggestionId, {
    status: input.decision,
    decidedBy: reviewer.id,
    decidedAt: new Date().toISOString(),
  });

  let incident: Incident | null = null;
  if (input.decision === "accepted") {
    const host = (await incidentOfReport(first.id)) ?? (await incidentOfReport(second.id)) ?? (await hostIncidentFor(first, reviewer));
    incident = host;
    for (const report of [first, second]) {
      const current = await incidentOfReport(report.id);
      if (!current || current.id !== host.id) incident = await mergeReport(host.id, report, reviewer, input.note);
    }
    // Accepting the match *is* the confirmation. The system had only suggested the membership, so
    // this is what turns "suggested" into "confirmed" for both reports.
    for (const report of [first, second]) {
      incident = await reviewMembership(host.id, report.id, "confirmed", reviewer, input.note);
    }
    if (suggestion.copySuspected) {
      // The later submission is the copy of the earlier one (same rule as in matching).
      const reportIsLater = Date.parse(first.submittedAt) >= Date.parse(second.submittedAt);
      const copyId = reportIsLater ? first.id : second.id;
      const originalId = reportIsLater ? second.id : first.id;
      await noteCopy(incident.id, copyId, originalId, suggestion.copyReasons);
    }
  } else {
    const a = await incidentOfReport(first.id);
    const b = await incidentOfReport(second.id);
    incident =
      a && b && a.id === b.id
        ? await separateReport(a.id, second.id, reviewer, input.note ?? "Suggested match rejected.")
        : (a ?? b);
  }

  await touchIncident(incident?.id);
  incident = incident ? await db.incidents.get(incident.id) : null;

  await recordAudit({
    actor: humanActor(reviewer.id, reviewer.name),
    action: `suggestion.${input.decision}`,
    targetType: "suggestion",
    targetId: suggestionId,
    incidentId: incident?.id,
    reportId: first.id,
    summary: `Suggested match between ${first.referenceCode} and ${second.referenceCode} ${input.decision} by ${reviewer.name}.`,
    note: input.note,
    before: { status: suggestion.status },
    after: { status: input.decision },
  });
  return { suggestion: updated, incident };
}

/**
 * Records a copy link on a member, so copies are never counted as independent sources. The copy is
 * attached to the report it copies, not to the incident in general.
 */
async function noteCopy(incidentId: string, copyId: string, originalId: string, reasons: string[]): Promise<void> {
  const db = getDb();
  const incident = await db.incidents.get(incidentId);
  if (!incident) return;
  const members = incident.members.map((m) => (m.reportId === copyId ? { ...m, copyOf: originalId, copyReasons: reasons } : m));
  await db.incidents.update(incidentId, { members });
}

/**
 * Resolves or dismisses a contradiction. "Resolved" means a reviewer has established what is
 * actually true (or which report is wrong); "dismissed" means it was not a real conflict. Either
 * way the flag stops counting against the incident.
 */
export async function decideContradiction(
  contradictionId: string,
  input: { decision: "resolved" | "dismissed"; note?: string },
  reviewer: Reviewer,
): Promise<Contradiction> {
  const db = getDb();
  const before = await db.contradictions.get(contradictionId);
  if (!before) throw new Error(`Contradiction ${contradictionId} not found`);

  const updated = await db.contradictions.update(contradictionId, {
    status: input.decision,
    resolution: {
      by: reviewer.id,
      byName: reviewer.name,
      at: new Date().toISOString(),
      ...(input.note ? { note: input.note } : {}),
    },
  });

  await recordAudit({
    actor: humanActor(reviewer.id, reviewer.name),
    action: `contradiction.${input.decision}`,
    targetType: "contradiction",
    targetId: contradictionId,
    incidentId: before.incidentId,
    summary: `Contradiction ${input.decision} by ${reviewer.name}.`,
    note: input.note,
    before: { status: before.status },
    after: { status: input.decision },
  });
  await touchIncident(before.incidentId);
  return updated;
}

/**
 * Puts a report into an incident by hand, or takes it out. This is the reviewer's override, so it
 * bypasses every candidate rule, including the hazard compatibility test, which is exactly why the
 * contradiction check re-runs afterwards.
 */
export async function placeReport(
  reportId: string,
  incidentId: string | null,
  reviewer: Reviewer,
  note?: string,
): Promise<Incident | null> {
  const db = getDb();
  const report = await db.reports.get(reportId);
  if (!report) throw new Error(`Report ${reportId} not found`);

  const previous = await incidentOfReport(reportId);
  if (incidentId === null) {
    if (!previous) return null;
    const updated = await separateReport(previous.id, reportId, reviewer, note);
    await touchIncident(previous.id);
    return updated;
  }

  const incident = await mergeReport(incidentId, report, reviewer, note);
  if (previous && previous.id !== incidentId) await touchIncident(previous.id);
  await touchIncident(incident.id);
  return db.incidents.get(incident.id);
}

/** Confirms or rejects one report's place in an incident. */
export async function decideMembership(
  incidentId: string,
  reportId: string,
  decision: "confirmed" | "rejected",
  reviewer: Reviewer,
  note?: string,
): Promise<Incident> {
  await reviewMembership(incidentId, reportId, decision, reviewer, note);
  await touchIncident(incidentId);
  return (await getDb().incidents.get(incidentId))!;
}
