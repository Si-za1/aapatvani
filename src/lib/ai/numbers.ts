// Guards against invented numbers: every number in model-written text must appear in its sources.

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

function asciiDigits(text: string): string {
  return text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

/** Numbers mentioned in text, normalised ("3,154" → "3154", "२३" → "23", "4.0" → "4"). */
export function numbersIn(text: string): string[] {
  const found = asciiDigits(text).match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  const out = new Set<string>();
  for (const raw of found) {
    const cleaned = raw.replace(/,(?=\d{3}\b)/g, "").replace(/,/g, "");
    const value = Number.parseFloat(cleaned);
    if (Number.isFinite(value)) out.add(String(value));
  }
  return [...out];
}

/** Numbers in `text` that none of the `sources` contain. `[[id]]` reference tokens are ignored. */
export function unsupportedNumbers(text: string, sources: string[]): string[] {
  const allowed = new Set(sources.flatMap(numbersIn));
  return numbersIn(text.replace(/\[\[[^\]]*\]\]/g, " ")).filter((n) => !allowed.has(n));
}
