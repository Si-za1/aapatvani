// Gemini never sees or returns real record ids. Each prompt registers the records it shows
// under short aliases (R1, M1, C1 …); the server maps aliases back and rejects anything unknown.

export class AliasRegistry<T> {
  private readonly byAlias = new Map<string, T>();
  private readonly counters = new Map<string, number>();

  register(prefix: string, value: T): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    const alias = `${prefix}${n}`;
    this.byAlias.set(alias, value);
    return alias;
  }

  resolve(alias: string | undefined | null): T | undefined {
    if (!alias) return undefined;
    return this.byAlias.get(alias.trim().toUpperCase());
  }

  has(alias: string | undefined | null): boolean {
    return this.resolve(alias) !== undefined;
  }

  get size(): number {
    return this.byAlias.size;
  }

  entries(): Array<[string, T]> {
    return [...this.byAlias.entries()];
  }
}

export type CitationCheck<T> = { valid: T[]; rejected: string[] };

/** Resolves a list of cited aliases, separating valid references from invented ones. */
export function checkCitations<T>(registry: AliasRegistry<T>, aliases: string[] | undefined): CitationCheck<T> {
  const valid: T[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const raw of aliases ?? []) {
    const alias = String(raw).trim().toUpperCase();
    if (seen.has(alias)) continue;
    seen.add(alias);
    const value = registry.resolve(alias);
    if (value === undefined) rejected.push(alias);
    else valid.push(value);
  }
  return { valid, rejected };
}
