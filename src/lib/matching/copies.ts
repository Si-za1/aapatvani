// Copy detection (project.md §8.2). A copied or forwarded report is not a second witness:
// the copy is linked to the report it copies and is excluded from the independent-source count.
//
// This is a *suspicion*, never a deletion. The original report is kept exactly as submitted, and a
// reviewer can see why the system flagged it.

import type { Report } from "@/lib/domain/schemas";
import type { PairFeatures } from "./candidates";

/** Character 5-gram Jaccard at or above this counts as near-identical wording. */
export const COPY_TEXT_THRESHOLD = 0.85;
/** Below this length, matching text is coincidence ("road blocked" appears in many reports). */
const MIN_TEXT_LENGTH = 40;

export interface CopyVerdict {
  suspected: boolean;
  reasons: string[];
}

export function detectCopy(
  a: Report,
  b: Report,
  lexicalSimilarity: number,
  features: PairFeatures,
): CopyVerdict {
  const reasons: string[] = [];

  if (features.sharedMedia) {
    const hashes = new Set(a.media.map((m) => m.sha256));
    const shared = b.media.find((m) => hashes.has(m.sha256));
    if (shared) reasons.push(`The same ${shared.kind} file is attached to both reports (SHA-256 ${shared.sha256.slice(0, 12)}…).`);
  }

  const textA = a.text.trim();
  const textB = b.text.trim();
  if (
    lexicalSimilarity >= COPY_TEXT_THRESHOLD &&
    textA.length >= MIN_TEXT_LENGTH &&
    textB.length >= MIN_TEXT_LENGTH
  ) {
    reasons.push(`Near-identical wording: ${Math.round(lexicalSimilarity * 100)}% of 5-character sequences match.`);
  }

  if (features.sameReporter) {
    reasons.push("Both reports came from the same anonymous device token.");
  }

  return { suspected: reasons.length > 0, reasons };
}
