// Text and vector similarity, used by candidate scoring and copy detection.
// Pure and deterministic: the same inputs always give the same numbers.

import type { Claim, Extraction, Report } from "@/lib/domain/schemas";

const DEVANAGARI_DIGITS: Record<string, string> = {
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
};

/**
 * Cosine similarity in [-1, 1], or null when either vector is missing, empty or all-zero.
 * Vectors of different lengths never compare: that means two different embedding models.
 */
export function cosineSimilarity(a: number[] | undefined, b: number[] | undefined): number | null {
  if (!a?.length || !b?.length || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Normalised form for n-gram comparison: NFC, lower case, Devanagari digits folded to ASCII,
 * punctuation, zero-width characters and all whitespace removed. What survives is the letters —
 * so "Road is BLOCKED!" and "road is blocked" compare as the same text.
 */
export function normalizeForShingles(text: string): string {
  let out = "";
  for (const raw of text.normalize("NFC").toLowerCase()) {
    if (/[​-‏⁠﻿]/.test(raw)) continue;
    if (/[\s.,;:!?'"()[\]{}।॥\-–—_/\\|*#@+=<>~`$%^&]/.test(raw)) continue;
    out += DEVANAGARI_DIGITS[raw] ?? raw;
  }
  return out;
}

/**
 * Character n-gram Jaccard similarity in [0, 1]. Used as a lexical signal and, above
 * COPY_TEXT_THRESHOLD, as evidence that one report copies another.
 * Texts shorter than n characters get 0: there is nothing to compare.
 */
export function shingleSimilarity(a: string, b: string, n = 5): number {
  const na = normalizeForShingles(a);
  const nb = normalizeForShingles(b);
  if (na.length < n || nb.length < n) return 0;

  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i + n <= s.length; i++) set.add(s.slice(i, i + n));
    return set;
  };
  const setA = grams(na);
  const setB = grams(nb);
  let shared = 0;
  for (const g of setA) if (setB.has(g)) shared++;
  const union = setA.size + setB.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * The reporter's own words, verbatim — the text a copy would duplicate.
 *
 * The English translation is deliberately *not* used here, even though it would make two reports in
 * different languages comparable. Comparing translations breaks copy detection: a forwarded report
 * is identical to its original only in the language it was written in, and comparing translations
 * makes two identical copies look different whenever just one of them has been through extraction
 * yet. Cross-lingual similarity is the embedding's job.
 */
export function reportVerbatimText(report: Report, extraction: Extraction | undefined): string {
  const own = report.text.trim();
  if (own) return own;
  // A voice-only report has no text, so the transcript stands in for it.
  return extraction?.transcript?.text?.trim() ?? "";
}

/** Reviewer-rejected claims never take part in matching or contradiction checks. */
export function usableClaims(claims: Claim[]): Claim[] {
  return claims.filter((c) => c.review.status !== "rejected");
}
