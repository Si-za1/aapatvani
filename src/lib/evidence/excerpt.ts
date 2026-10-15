// Verifies that a model-quoted excerpt really appears in the reporter's original text.
// Pure and deterministic. Positions refer to the NFC-normalised original text.

const DEVANAGARI_DIGITS: Record<string, string> = {
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
};
const PUNCT_EQUIV: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"', "«": '"', "»": '"',
  "–": "-", "-": "-", "−": "-",
  "…": "...",
};
const ZERO_WIDTH = /[​-‍⁠﻿]/;
const EDGE_PUNCT = /^[\s.,;:!?'"()\[\]{}।॥\-‐-―…]+|[\s.,;:!?'"()\[\]{}।॥\-‐-―…]+$/g;

export function canonicalText(text: string): string {
  return text.normalize("NFC");
}

type Indexed = { norm: string; map: number[] };

/** Normalises text for matching and keeps a map from each normalised char to its source index. */
function buildIndex(text: string, dropPunctuation = false): Indexed {
  const src = canonicalText(text);
  let norm = "";
  const map: number[] = [];
  let prevSpace = true;
  for (let i = 0; i < src.length; i++) {
    let ch = src[i];
    if (ZERO_WIDTH.test(ch)) continue;
    if (/\s/.test(ch)) {
      if (prevSpace) continue;
      ch = " ";
      prevSpace = true;
    } else {
      prevSpace = false;
    }
    ch = PUNCT_EQUIV[ch] ?? ch;
    // The second pass is for punctuation STYLE — a comma the model left out, a bracket it added.
    // Sentence enders are deliberately NOT dropped. Dropping them let a quotation be assembled
    // across a sentence boundary: the report "The bridge was not damaged. The road is closed."
    // matched the quote "damaged the road is closed", whose highlight began after the word "not" and
    // therefore read as the opposite of what the reporter wrote. A quotation is supposed to be a
    // span of the report, not fragments of two sentences with the join hidden.
    if (dropPunctuation && /[,;:'"()\[\]{}\-]/.test(ch)) {
      continue;
    }
    const lower = ch.toLowerCase();
    if (lower.length === ch.length) ch = lower;
    ch = DEVANAGARI_DIGITS[ch] ?? ch;
    for (const c of ch) {
      norm += c;
      map.push(i);
    }
  }
  while (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

export type ExcerptLocation = { verified: boolean; start?: number; end?: number };

/**
 * A quotation has to be long enough that finding it means something.
 *
 * The floor used to be three characters with no word requirement, so "the" verified against a
 * 600,000-character report and "road" verified inside the word "Broadway". A claim citing either
 * earned the same "Reported · verified" label as one quoting a whole sentence — the label this
 * product asks a reviewer to trust.
 *
 * Two tests, either of which is enough: a phrase of two or more words, or a single word of five or
 * more characters. The second exists for Devanagari, where one word carries a lot — "लार्चा" and
 * "काभ्रे" are place names, and a place or time mention is legitimately a single word. Ten
 * characters was tried first and downgraded "केही भयो", a real excerpt from a real scenario;
 * degrading a genuine quotation is its own kind of dishonesty, so the floor sits where it admits
 * every short phrase the corpus actually contains while still refusing "the" and "road".
 */
const MIN_EXCERPT_CHARS = 5;
const MIN_EXCERPT_WORDS = 2;

/**
 * Finds `excerpt` inside `original`. Tolerates differences in whitespace, quote style, letter case,
 * Devanagari vs ASCII digits and surrounding punctuation, nothing else.
 */
export function locateExcerpt(original: string, excerpt: string): ExcerptLocation {
  const cleaned = excerpt.replace(EDGE_PUNCT, "");
  const words = cleaned.split(/\s+/).filter(Boolean).length;
  if (cleaned.length < MIN_EXCERPT_CHARS && words < MIN_EXCERPT_WORDS) return { verified: false };
  for (const dropPunctuation of [false, true]) {
    const hay = buildIndex(original, dropPunctuation);
    const needle = buildIndex(cleaned, dropPunctuation).norm;
    if (!needle) continue;
    const idx = hay.norm.indexOf(needle);
    if (idx < 0) continue;
    return { verified: true, start: hay.map[idx], end: hay.map[idx + needle.length - 1] + 1 };
  }
  return { verified: false };
}

// A word-boundary rule was tried here and removed, deliberately. It read well in English — "road"
// no longer matching inside "Broadway" — and it broke Nepali, which is agglutinative: the report
// says "अरनिको राजमार्गमा" and the model's quotation of "अरनिको राजमार्ग" is a genuine span whose
// end falls in the middle of a written word, because the locative suffix is glued to the noun. The
// rule rejected that quotation and downgraded a claim the reporter had actually made. The length
// floor above already refuses the fragments the boundary rule was aimed at, so it was cost without
// benefit — and a check that is right in one language and wrong in the other is worse than none.

/** Splits the original text into plain and highlighted segments for display. */
export function segmentText(
  original: string,
  ranges: Array<{ start: number; end: number; id: string }>,
): Array<{ text: string; ids: string[] }> {
  const text = canonicalText(original);
  const points = new Set<number>([0, text.length]);
  for (const r of ranges) {
    points.add(Math.max(0, Math.min(text.length, r.start)));
    points.add(Math.max(0, Math.min(text.length, r.end)));
  }
  const sorted = [...points].sort((a, b) => a - b);
  const out: Array<{ text: string; ids: string[] }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const [a, b] = [sorted[i], sorted[i + 1]];
    if (a === b) continue;
    const ids = ranges.filter((r) => r.start <= a && r.end >= b).map((r) => r.id);
    out.push({ text: text.slice(a, b), ids });
  }
  return out;
}
