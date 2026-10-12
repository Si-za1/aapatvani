import "server-only";

// Incident lifecycle (project.md §7, features M6/M7). An incident is a *grouping of reports*, and
// only a reviewer can settle one: the system proposes membership, a person confirms or separates.
//
// Two rules run through everything here:
//   • A copy is a member, but never an independent source. Copies are counted separately so that a
//     forwarded rumour cannot look like corroboration.
//   • Nothing is deleted. Separating a report removes it from the grouping; the report, its claims
//     and its history remain.

import { hazardLabel, getRegion } from "@/config/regions";
import { recordAudit, humanActor, systemActor } from "@/lib/audit";
import { getDb } from "@/lib/db";
import type { Actor, Claim, Incident, IncidentMember, IncidentStatus, Report } from "@/lib/domain/schemas";
import { newId } from "@/lib/ids";
import type { ReportPoint } from "@/lib/matching/candidates";

export interface IncidentDraftInput {
  regionId: string;
  dataLabel: Report["dataLabel"];
  report: Report;
  point: ReportPoint | null;
  hazard: string | undefined;
  createdBy: string;
}

/**
 * A short, plain title. Reviewers can change it later; it is a label, not a finding.
 * "Mapped location" and "location not yet established" are deliberately different: having
 * coordinates and being able to name the place are not the same thing.
 */
export function incidentTitle(hazard: string | undefined, report: Report, regionId: string, point: ReportPoint | null): string {
  const region = getRegion(regionId);
  const hazardText = hazard ? hazardLabel(region, hazard) : "Reported incident";
  const place = report.location.placeText?.trim();
  if (place) return `${hazardText} near ${place}`;
  return point ? `${hazardText} (mapped location, place not named)` : `${hazardText} (location not established)`;
}

export async function createCandidateIncident(input: IncidentDraftInput): Promise<Incident> {
  const db = getDb();
  const now = new Date().toISOString();
  const { report, point } = input;

  const incident: Incident = {
    id: newId("inc"),
    regionId: input.regionId,
    dataLabel: input.dataLabel,
    title: incidentTitle(input.hazard, report, input.regionId, point),
    hazard: { category: input.hazard ?? "unclear", source: report.reporterHazard ? "reporter" : "ai" },
    status: "candidate",
    members: [
      {
        reportId: report.id,
        // Even the founding report is only proposed: the incident itself is a candidate until a
        // reviewer settles it.
        membership: "suggested",
        addedBy: input.createdBy,
        addedAt: now,
      },
    ],
    reportIds: [report.id],
    location: point
      ? {
          lat: point.lat,
          lng: point.lng,
          uncertaintyM: point.uncertaintyM,
          source: point.source,
          basisReportId: report.id,
        }
      : undefined,
    firstReportedAt: report.submittedAt,
    lastReportedAt: report.submittedAt,
    independentSources: 0,
    openContradictions: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };

  const stored = await db.incidents.create(incident);
  await db.reports.update(report.id, { incidentId: stored.id });
  await recomputeIncident(stored.id);
  await recordAudit({
    actor: systemActor(),
    action: "incident.created",
    targetType: "incident",
    targetId: stored.id,
    incidentId: stored.id,
    reportId: report.id,
    summary: `Candidate incident opened from report ${report.referenceCode}.`,
  });
  return (await db.incidents.get(stored.id))!;
}

export interface AddMemberInput {
  incidentId: string;
  report: Report;
  addedBy: string;
  membership?: IncidentMember["membership"];
  copyOf?: string;
  copyReasons?: string[];
  actor?: Actor;
  note?: string;
}

export async function addMember(input: AddMemberInput): Promise<Incident> {
  const db = getDb();
  const incident = await db.incidents.get(input.incidentId);
  if (!incident) throw new Error(`Incident ${input.incidentId} not found`);
  if (incident.reportIds.includes(input.report.id)) return incident;

  const now = new Date().toISOString();
  const member: IncidentMember = {
    reportId: input.report.id,
    membership: input.membership ?? "suggested",
    addedBy: input.addedBy,
    addedAt: now,
    ...(input.copyOf ? { copyOf: input.copyOf, copyReasons: input.copyReasons ?? [] } : {}),
  };

  await db.incidents.update(incident.id, {
    members: [...incident.members, member],
    reportIds: [...incident.reportIds, input.report.id],
    lastReportedAt: input.report.submittedAt > incident.lastReportedAt ? input.report.submittedAt : incident.lastReportedAt,
  });
  await db.reports.update(input.report.id, { incidentId: incident.id });
  await recomputeIncident(incident.id);
  await recordAudit({
    actor: input.actor ?? systemActor(),
    action: "incident.member_added",
    targetType: "incident",
    targetId: incident.id,
    incidentId: incident.id,
    reportId: input.report.id,
    summary: `Report ${input.report.referenceCode} ${input.copyOf ? "linked as a copy" : "added"} to the incident.`,
    note: input.note ?? input.copyReasons?.join(" "),
  });
  return (await db.incidents.get(incident.id))!;
}

/**
 * Recomputes the derived fields of an incident from its members. Independent sources exclude
 * copies; contradictions are counted from the flags currently open.
 */
export async function recomputeIncident(incidentId: string): Promise<Incident | null> {
  const db = getDb();
  const incident = await db.incidents.get(incidentId);
  if (!incident) return null;

  const reports = await db.reports.getMany(incident.reportIds);
  const contradictions = await db.contradictions.list({ where: [{ field: "incidentId", op: "==", value: incidentId }] });
  const openContradictions = contradictions.filter((c) => c.status === "open").length;

  const times = reports.map((r) => r.submittedAt).sort();
  const patch: Partial<Incident> = {
    independentSources: incident.members.filter((m) => !m.copyOf).length,
    openContradictions,
    updatedAt: new Date().toISOString(),
    ...(times.length ? { firstReportedAt: times[0], lastReportedAt: times[times.length - 1] } : {}),
  };
  return db.incidents.update(incidentId, patch);
}

/** The incident a report currently belongs to, if any. */
export async function incidentOfReport(reportId: string): Promise<Incident | null> {
  const db = getDb();
  const report = await db.reports.get(reportId);
  if (!report?.incidentId) return null;
  return db.incidents.get(report.incidentId);
}

/**
 * Reviewer decision on the grouping as a whole. `verified` means a person has checked that these
 * reports describe one event; `dismissed` means they do not.
 */
export async function setIncidentStatus(
  incidentId: string,
  status: IncidentStatus,
  reviewer: { id: string; name: string },
  note?: string,
): Promise<Incident> {
  const db = getDb();
  const before = await db.incidents.get(incidentId);
  if (!before) throw new Error(`Incident ${incidentId} not found`);

  const now = new Date().toISOString();
  const patch: Partial<Incident> = { status };
  if (status === "verified" || status === "dismissed") {
    patch.verification = { by: reviewer.id, byName: reviewer.name, at: now, ...(note ? { note } : {}) };
    // Settling the incident settles the membership it was proposed with.
    patch.members = before.members.map((m) => (status === "verified" ? { ...m, membership: "confirmed" as const } : m));
  }

  const updated = await db.incidents.update(incidentId, patch);
  await recordAudit({
    actor: humanActor(reviewer.id, reviewer.name),
    action: `incident.${status}`,
    targetType: "incident",
    targetId: incidentId,
    incidentId,
    summary: `Incident marked ${status.replace("_", " ")} by ${reviewer.name}.`,
    note,
    before: { status: before.status },
    after: { status },
  });
  return updated;
}

/**
 * Reviewer separates one report from an incident. The report keeps its own claims and evidence; it
 * simply leaves this grouping. If it was the last member, the incident is dismissed.
 */
export async function separateReport(
  incidentId: string,
  reportId: string,
  reviewer: { id: string; name: string },
  note?: string,
): Promise<Incident> {
  const db = getDb();
  const incident = await db.incidents.get(incidentId);
  if (!incident) throw new Error(`Incident ${incidentId} not found`);

  const members = incident.members.filter((m) => m.reportId !== reportId);
  const reportIds = incident.reportIds.filter((id) => id !== reportId);
  const updated = await db.incidents.update(incidentId, {
    members,
    reportIds,
    ...(members.length === 0 ? { status: "dismissed" as const } : {}),
  });
  await db.reports.update(reportId, { incidentId: undefined });
  await recomputeIncident(incidentId);

  await recordAudit({
    actor: humanActor(reviewer.id, reviewer.name),
    action: "incident.member_removed",
    targetType: "incident",
    targetId: incidentId,
    incidentId,
    reportId,
    summary: `Report separated from the incident by ${reviewer.name}.`,
    note,
  });
  return (await db.incidents.get(updated.id))!;
}

/**
 * Reviewer merges a report into an incident. Contradiction rules are re-run afterwards by the
 * caller, because a human merge can create conflicts the candidate filter would have filtered out
 * (two incompatible hazards, for example).
 */
export async function mergeReport(
  incidentId: string,
  report: Report,
  reviewer: { id: string; name: string },
  note?: string,
): Promise<Incident> {
  const previous = await incidentOfReport(report.id);
  if (previous && previous.id !== incidentId) {
    await separateReport(previous.id, report.id, reviewer, "Moved to another incident.");
  }
  return addMember({
    incidentId,
    report,
    addedBy: reviewer.id,
    membership: "confirmed",
    actor: humanActor(reviewer.id, reviewer.name),
    note,
  });
}

/** Confirms or rejects a single member's place in the incident. */
export async function reviewMembership(
  incidentId: string,
  reportId: string,
  decision: "confirmed" | "rejected",
  reviewer: { id: string; name: string },
  note?: string,
): Promise<Incident> {
  const db = getDb();
  const incident = await db.incidents.get(incidentId);
  if (!incident) throw new Error(`Incident ${incidentId} not found`);
  if (decision === "rejected") return separateReport(incidentId, reportId, reviewer, note);

  const members = incident.members.map((m) => (m.reportId === reportId ? { ...m, membership: "confirmed" as const } : m));
  await db.incidents.update(incidentId, { members });
  await recordAudit({
    actor: humanActor(reviewer.id, reviewer.name),
    action: "incident.membership_confirmed",
    targetType: "incident",
    targetId: incidentId,
    incidentId,
    reportId,
    summary: `Membership confirmed by ${reviewer.name}.`,
    note,
  });
  return (await db.incidents.get(incidentId))!;
}

/** Claims that a reviewer should look at when triaging an incident. */
export async function incidentClaims(incident: Incident): Promise<Claim[]> {
  const db = getDb();
  return db.claims.list({ where: [{ field: "reportId", op: "in", value: incident.reportIds }] });
}
