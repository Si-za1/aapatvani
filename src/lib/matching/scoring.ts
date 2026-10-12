// Feature scoring for a candidate pair (project.md §8.2, feature M6).
//
// The score is advice, not a decision: it orders the review queue and is always shown next to its
// breakdown, so a reviewer sees *why* two reports look related. Nothing merges automatically.
//
// The weights and the cosine mapping are starting values, to be tuned on the labelled synthetic
// scenarios in chunk 8 and reported honestly (§12). They are deliberately in one place.

import { CANDIDATE_RADIUS_M, CANDIDATE_WINDOW_HOURS, type PairFeatures } from "./candidates";

export const SCORE_WEIGHTS = {
  proximity: 0.25,
  time: 0.15,
  hazard: 0.2,
  semantic: 0.3,
  lexical: 0.1,
} as const;

/**
 * Embedding cosines for short, related texts sit high (often 0.7–0.95), and unrelated ones rarely
 * fall to 0, so the raw value is stretched across this window before it becomes a feature.
 */
export const COSINE_FLOOR = 0.55;

export interface ScorePart {
  key: keyof typeof SCORE_WEIGHTS;
  label: string;
  /** 0–1, or null when the signal was not available for this pair. */
  value: number | null;
  weight: number;
  /** What the signal contributed after renormalising over the available signals. */
  contribution: number;
  detail: string;
}

export interface ScoreBreakdown {
  total: number;
  parts: ScorePart[];
  /** Names of the signals that could not be used, for the "why this score" display. */
  unavailable: string[];
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function hazardValue(match: PairFeatures["hazardMatch"]): number {
  return { same: 1, compatible: 0.6, unknown: 0.35, different: 0 }[match];
}

export function scorePair(features: PairFeatures, lexicalSimilarity: number): ScoreBreakdown {
  const proximity =
    features.effectiveDistanceKm === null ? null : clamp01(1 - (features.effectiveDistanceKm * 1000) / CANDIDATE_RADIUS_M);
  const time = features.hoursApart === null ? null : clamp01(1 - features.hoursApart / CANDIDATE_WINDOW_HOURS);
  const semantic =
    features.semanticSimilarity === null ? null : clamp01((features.semanticSimilarity - COSINE_FLOOR) / (1 - COSINE_FLOOR));

  const parts: ScorePart[] = [
    {
      key: "proximity",
      label: "Distance",
      value: proximity,
      weight: SCORE_WEIGHTS.proximity,
      contribution: 0,
      detail:
        features.effectiveDistanceKm === null
          ? "no location for one of the reports"
          : `${features.effectiveDistanceKm.toFixed(1)} km apart after allowing for location uncertainty`,
    },
    {
      key: "time",
      label: "Time",
      value: time,
      weight: SCORE_WEIGHTS.time,
      contribution: 0,
      detail: features.hoursApart === null ? "submission times unavailable" : `${features.hoursApart.toFixed(1)} h apart`,
    },
    {
      key: "hazard",
      label: "Hazard",
      value: hazardValue(features.hazardMatch),
      weight: SCORE_WEIGHTS.hazard,
      contribution: 0,
      detail: `hazard categories are ${features.hazardMatch}`,
    },
    {
      key: "semantic",
      label: "Meaning",
      value: semantic,
      weight: SCORE_WEIGHTS.semantic,
      contribution: 0,
      detail:
        features.semanticSimilarity === null
          ? "no embedding available for one of the reports"
          : `embedding similarity ${features.semanticSimilarity.toFixed(2)}`,
    },
    {
      key: "lexical",
      label: "Wording",
      value: lexicalSimilarity,
      weight: SCORE_WEIGHTS.lexical,
      contribution: 0,
      detail: `shared 5-character sequences: ${Math.round(lexicalSimilarity * 100)}%`,
    },
  ];

  const availableWeight = parts.reduce((sum, p) => (p.value === null ? sum : sum + p.weight), 0);
  for (const part of parts) {
    part.contribution = part.value === null || availableWeight === 0 ? 0 : (part.value * part.weight) / availableWeight;
  }
  const total = parts.reduce((sum, p) => sum + p.contribution, 0);

  return {
    total: clamp01(total),
    parts,
    unavailable: parts.filter((p) => p.value === null).map((p) => p.label.toLowerCase()),
  };
}
