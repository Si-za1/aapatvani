import "server-only";

// Append-only audit trail (feature M5). Every action that changes state is recorded once, with the
// actor that caused it, a person, the model, or the system. Events are never edited or deleted, so
// the trail can answer "who decided this, and on what did they base it?".

import { getDb } from "@/lib/db";
import type { Actor, AuditEvent, AuditTarget } from "@/lib/domain/schemas";
import { newId } from "@/lib/ids";

export interface AuditInput {
  actor: Actor;
  action: string;
  targetType: AuditTarget;
  targetId: string;
  summary: string;
  incidentId?: string;
  reportId?: string;
  note?: string;
  before?: unknown;
  after?: unknown;
}

export function systemActor(): Actor {
  return { kind: "system", id: "system", name: "AapatVani" };
}

export function aiActor(model: string): Actor {
  return { kind: "ai", id: model, name: "Gemini", model };
}

export function publicActor(reporterToken: string): Actor {
  return { kind: "public", id: reporterToken, name: "Reporter" };
}

export function humanActor(id: string, name: string): Actor {
  return { kind: "human", id, name };
}

export async function recordAudit(input: AuditInput): Promise<AuditEvent> {
  const event: AuditEvent = {
    id: newId("evt"),
    at: new Date().toISOString(),
    ...input,
  };
  return getDb().events.create(event);
}
