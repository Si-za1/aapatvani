import "server-only";
import {
  AlertDraft,
  AuditEvent,
  Claim,
  Contradiction,
  Extraction,
  ImpactAssessment,
  Incident,
  Report,
  Suggestion,
} from "@/lib/domain/schemas";
import { getEnv } from "@/lib/env";
import { FirestoreCollection } from "./firestore";
import { LocalCollection } from "./local";
import type { Database } from "./types";

export type { Database } from "./types";

let instance: Database | undefined;

const COLLECTIONS = {
  reports: ["reports", Report],
  extractions: ["extractions", Extraction],
  claims: ["claims", Claim],
  incidents: ["incidents", Incident],
  suggestions: ["suggestions", Suggestion],
  contradictions: ["contradictions", Contradiction],
  impacts: ["impactAssessments", ImpactAssessment],
  alerts: ["alertDrafts", AlertDraft],
  events: ["auditEvents", AuditEvent],
} as const;

export function createDatabase(backend: "local" | "firestore", localDir?: string): Database {
  const make = (name: string, schema: never) =>
    backend === "firestore" ? new FirestoreCollection(name, schema) : new LocalCollection(name, schema, localDir!);
  const db = { backend } as Record<string, unknown>;
  for (const [key, [name, schema]] of Object.entries(COLLECTIONS)) db[key] = make(name, schema as never);
  return db as unknown as Database;
}

export function getDb(): Database {
  if (instance) return instance;
  const env = getEnv();
  instance = createDatabase(env.dataBackend, env.localDataDir);
  return instance;
}
