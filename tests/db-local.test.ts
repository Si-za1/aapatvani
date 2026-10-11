import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LocalCollection } from "@/lib/db/local";

const Doc = z.object({ id: z.string(), name: z.string(), n: z.number(), tags: z.array(z.string()) });
type Doc = z.infer<typeof Doc>;

function collection() {
  const dir = mkdtempSync(path.join(tmpdir(), "av-db-"));
  return new LocalCollection<Doc>("docs", Doc, dir);
}

describe("local collection", () => {
  it("creates, reads, updates and deletes", async () => {
    const col = collection();
    await col.create({ id: "a", name: "Alpha", n: 1, tags: ["x"] });
    expect(await col.get("a")).toEqual({ id: "a", name: "Alpha", n: 1, tags: ["x"] });
    const updated = await col.update("a", { n: 2 });
    expect(updated.n).toBe(2);
    await col.delete("a");
    expect(await col.get("a")).toBeNull();
  });

  it("rejects duplicates and invalid documents", async () => {
    const col = collection();
    await col.create({ id: "a", name: "Alpha", n: 1, tags: [] });
    await expect(col.create({ id: "a", name: "Again", n: 2, tags: [] })).rejects.toThrow(/already exists/);
    await expect(col.update("a", { n: "two" as unknown as number })).rejects.toThrow();
    await expect(col.update("missing", { n: 3 })).rejects.toThrow(/not found/);
  });

  it("filters, sorts and limits", async () => {
    const col = collection();
    await col.create({ id: "a", name: "Alpha", n: 3, tags: ["red"] });
    await col.create({ id: "b", name: "Beta", n: 1, tags: ["blue", "red"] });
    await col.create({ id: "c", name: "Gamma", n: 2, tags: ["blue"] });
    const red = await col.list({ where: [{ field: "tags", op: "array-contains", value: "red" }], orderBy: { field: "n", direction: "asc" } });
    expect(red.map((d) => d.id)).toEqual(["b", "a"]);
    const some = await col.list({ where: [{ field: "id", op: "in", value: ["a", "c"] }], orderBy: { field: "n", direction: "desc" }, limit: 1 });
    expect(some.map((d) => d.id)).toEqual(["a"]);
    expect((await col.getMany(["c", "zzz", "a"])).map((d) => d.id)).toEqual(["c", "a"]);
  });

  it("does not lose concurrent writes", async () => {
    const col = collection();
    await Promise.all(Array.from({ length: 25 }, (_, i) => col.create({ id: `d${i}`, name: "x", n: i, tags: [] })));
    expect(await col.list()).toHaveLength(25);
  });
});
