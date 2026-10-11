import type {
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

export type WhereOp = "==" | "in" | "array-contains";

export interface Query<T> {
  where?: Array<{ field: keyof T & string; op: WhereOp; value: unknown }>;
  orderBy?: { field: keyof T & string; direction: "asc" | "desc" };
  limit?: number;
}

export interface Collection<T extends { id: string }> {
  readonly name: string;
  get(id: string): Promise<T | null>;
  getMany(ids: string[]): Promise<T[]>;
  list(query?: Query<T>): Promise<T[]>;
  /** Fails if a document with the same id already exists. */
  create(doc: T): Promise<T>;
  /** Creates or replaces. */
  set(doc: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

export interface Database {
  readonly backend: "local" | "firestore";
  reports: Collection<Report>;
  extractions: Collection<Extraction>;
  claims: Collection<Claim>;
  incidents: Collection<Incident>;
  suggestions: Collection<Suggestion>;
  contradictions: Collection<Contradiction>;
  impacts: Collection<ImpactAssessment>;
  alerts: Collection<AlertDraft>;
  events: Collection<AuditEvent>;
}

/** Shared in-memory query evaluation (used by the local store and for Firestore post-filtering). */
export function applyQuery<T extends { id: string }>(docs: T[], query: Query<T> = {}): T[] {
  let out = docs;
  for (const w of query.where ?? []) {
    out = out.filter((d) => {
      const v = (d as Record<string, unknown>)[w.field];
      if (w.op === "==") return v === w.value;
      if (w.op === "in") return Array.isArray(w.value) && (w.value as unknown[]).includes(v);
      return Array.isArray(v) && (v as unknown[]).includes(w.value);
    });
  }
  if (query.orderBy) {
    const { field, direction } = query.orderBy;
    const sign = direction === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      const av = (a as Record<string, unknown>)[field] as string | number | undefined;
      const bv = (b as Record<string, unknown>)[field] as string | number | undefined;
      if (av === bv) return a.id.localeCompare(b.id);
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return av < bv ? -sign : sign;
    });
  }
  if (query.limit !== undefined) out = out.slice(0, query.limit);
  return out;
}
