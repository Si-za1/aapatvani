import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { applyQuery, type Collection, type Query } from "./types";

// File-backed store for local development and demos without cloud credentials.
// One JSON file per collection; writes are serialised per collection and atomic (write + rename).
// Not for production: on Cloud Run the filesystem is per-instance and is wiped on restart.

const locks = new Map<string, Promise<unknown>>();

function withLock<R>(key: string, fn: () => Promise<R>): Promise<R> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  locks.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

export class LocalCollection<T extends { id: string }> implements Collection<T> {
  private readonly file: string;

  constructor(
    readonly name: string,
    private readonly schema: z.ZodType<T>,
    dir: string,
  ) {
    this.file = path.join(dir, "db", `${name}.json`);
  }

  private async readAll(): Promise<Record<string, T>> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as Record<string, T>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw err;
    }
  }

  private async writeAll(data: Record<string, T>): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, this.file);
  }

  async get(id: string): Promise<T | null> {
    const all = await this.readAll();
    return all[id] ?? null;
  }

  async getMany(ids: string[]): Promise<T[]> {
    const all = await this.readAll();
    return ids.map((id) => all[id]).filter((d): d is T => Boolean(d));
  }

  async list(query?: Query<T>): Promise<T[]> {
    return applyQuery(Object.values(await this.readAll()), query);
  }

  create(doc: T): Promise<T> {
    const valid = this.schema.parse(doc);
    return withLock(this.file, async () => {
      const all = await this.readAll();
      if (all[valid.id]) throw new Error(`${this.name}/${valid.id} already exists`);
      all[valid.id] = valid;
      await this.writeAll(all);
      return valid;
    });
  }

  set(doc: T): Promise<T> {
    const valid = this.schema.parse(doc);
    return withLock(this.file, async () => {
      const all = await this.readAll();
      all[valid.id] = valid;
      await this.writeAll(all);
      return valid;
    });
  }

  update(id: string, patch: Partial<T>): Promise<T> {
    return withLock(this.file, async () => {
      const all = await this.readAll();
      const current = all[id];
      if (!current) throw new Error(`${this.name}/${id} not found`);
      const merged = this.schema.parse({ ...current, ...patch, id });
      all[id] = merged;
      await this.writeAll(all);
      return merged;
    });
  }

  delete(id: string): Promise<void> {
    return withLock(this.file, async () => {
      const all = await this.readAll();
      delete all[id];
      await this.writeAll(all);
    });
  }
}
