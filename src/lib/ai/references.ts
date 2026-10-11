import type { AliasRegistry } from "@/lib/evidence/aliases";

// Model-written text may refer to aliases ("A1", "K2"). Before storing, aliases are rewritten to
// `[[recordId]]` tokens the UI turns into evidence links; unknown aliases are removed and counted.

export function rewriteAliases<T extends { id: string }>(
  text: string,
  registry: AliasRegistry<T>,
  prefixes: string[],
): { text: string; rejected: string[] } {
  const rejected: string[] = [];
  const pattern = new RegExp(`\\[?\\b(${prefixes.join("|")})(\\d+)\\b\\]?`, "g");
  const out = text.replace(pattern, (_match, prefix: string, n: string) => {
    const alias = `${prefix}${n}`;
    const target = registry.resolve(alias);
    if (!target) {
      rejected.push(alias);
      return "";
    }
    return `[[${target.id}]]`;
  });
  return { text: out.replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim(), rejected };
}

/** Removes inline alias mentions such as "(K1)", "[K1, I2]" or "K1" from display text. */
export function removeAliasMentions(text: string, prefixes: string[]): string {
  const alias = `(?:${prefixes.join("|")})\\d+`;
  return text
    .replace(new RegExp(`\\s*[\\[(]\\s*${alias}(?:\\s*[,;]\\s*${alias})*\\s*[\\])]`, "g"), "")
    .replace(new RegExp(`\\b${alias}\\b`, "g"), "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:।])/g, "$1")
    .trim();
}

/** Splits stored text with `[[id]]` tokens into plain and reference segments for display. */
export function splitReferences(text: string): Array<{ text: string } | { ref: string }> {
  const parts: Array<{ text: string } | { ref: string }> = [];
  let last = 0;
  for (const m of text.matchAll(/\[\[([A-Za-z0-9_:/.-]+)\]\]/g)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ ref: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
