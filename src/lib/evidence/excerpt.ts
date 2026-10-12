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
    if (dropPunctuation && /[.,;:!?'"()\[\]{}।॥\-]/.test(ch)) {
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
 * Finds `excerpt` inside `original`. Tolerates differences in whitespace, quote style, letter case,
 * Devanagari vs ASCII digits and surrounding punctuation, nothing else.
 */
export function locateExcerpt(original: string, excerpt: string): ExcerptLocation {
  const cleaned = excerpt.replace(EDGE_PUNCT, "");
  if (cleaned.length < 3) return { verified: false };
  for (const dropPunctuation of [false, true]) {
    const hay = buildIndex(original, dropPunctuation);
    const needle = buildIndex(cleaned, dropPunctuation).norm;
    if (!needle) continue;
    const idx = hay.norm.indexOf(needle);
    if (idx >= 0) {
      return { verified: true, start: hay.map[idx], end: hay.map[idx + needle.length - 1] + 1 };
    }
  }
  return { verified: false };
}

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
