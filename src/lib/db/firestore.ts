import "server-only";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { z } from "zod";
import { getEnv } from "@/lib/env";
import { getAdminApp } from "@/lib/firebase-admin";
import { applyQuery, type Collection, type Query } from "./types";

// Firestore-backed collections, accessed only from the server with the Admin SDK.
// Client access is denied by firestore.rules, so every read and write passes through
// the server's access checks. Sorting is done in memory to avoid composite indexes.

let db: Firestore | undefined;

function firestore(): Firestore {
  if (db) return db;
  const env = getEnv();
  const app = getAdminApp();
  db = env.firestoreDatabaseId ? getFirestore(app, env.firestoreDatabaseId) : getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

export class FirestoreCollection<T extends { id: string }> implements Collection<T> {
  constructor(
    readonly name: string,
    private readonly schema: z.ZodType<T>,
  ) {}

  private col() {
    return firestore().collection(this.name);
  }

  async get(id: string): Promise<T | null> {
    const snap = await this.col().doc(id).get();
    return snap.exists ? (snap.data() as T) : null;
  }

  async getMany(ids: string[]): Promise<T[]> {
    if (ids.length === 0) return [];
    const refs = ids.map((id) => this.col().doc(id));
    const snaps = await firestore().getAll(...refs);
    return snaps.filter((s) => s.exists).map((s) => s.data() as T);
  }

  async list(query: Query<T> = {}): Promise<T[]> {
    let q: FirebaseFirestore.Query = this.col();
    const inMemory: Query<T>["where"] = [];
    let usedServerFilter = false;
    for (const w of query.where ?? []) {
      // Firestore allows one array-contains / in per query; apply the rest in memory.
      if (!usedServerFilter || w.op === "==") {
        if (w.op === "in" && Array.isArray(w.value) && (w.value.length === 0 || w.value.length > 30)) {
          inMemory.push(w);
          continue;
        }
        q = q.where(w.field, w.op, w.value);
        if (w.op !== "==") usedServerFilter = true;
      } else {
        inMemory.push(w);
      }
    }
    if (query.where?.some((w) => w.op === "in" && Array.isArray(w.value) && w.value.length === 0)) return [];
    const snap = await q.get();
    const docs = snap.docs.map((d) => d.data() as T);
    return applyQuery(docs, { where: inMemory, orderBy: query.orderBy, limit: query.limit });
  }

  async create(doc: T): Promise<T> {
    const valid = this.schema.parse(doc);
    await this.col().doc(valid.id).create(valid as FirebaseFirestore.DocumentData);
    return valid;
  }

  async set(doc: T): Promise<T> {
    const valid = this.schema.parse(doc);
    await this.col().doc(valid.id).set(valid as FirebaseFirestore.DocumentData);
    return valid;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const ref = this.col().doc(id);
    return firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error(`${this.name}/${id} not found`);
      const merged = this.schema.parse({ ...(snap.data() as T), ...patch, id });
      tx.set(ref, merged as FirebaseFirestore.DocumentData);
      return merged;
    });
  }

  async delete(id: string): Promise<void> {
    await this.col().doc(id).delete();
  }
}
