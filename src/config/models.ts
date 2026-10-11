// Gemini model choices, in one place. Override any of them with environment variables.
// Verified against ai.google.dev model listings on 2026-10-11; confirm with `npm run check:models`.

export const MODELS = {
  /** Multimodal extraction from text, photos and voice notes. */
  extraction: process.env.GEMINI_MODEL_EXTRACTION ?? "gemini-3.8-flash",
  /** Pairwise report comparison and contradiction reasoning. */
  reasoning: process.env.GEMINI_MODEL_REASONING ?? "gemini-3.8-flash",
  /** Alert drafting and plain-language explanations. */
  drafting: process.env.GEMINI_MODEL_DRAFTING ?? "gemini-3.8-flash",
  /** Used once when the primary model is unavailable or rate-limited. */
  fallback: process.env.GEMINI_MODEL_FALLBACK ?? "gemini-3.5-flash-lite",
  /** Multilingual text embeddings for report matching (Nepali ↔ English). */
  embedding: process.env.GEMINI_MODEL_EMBEDDING ?? "gemini-embedding-001",
} as const;

export const EMBEDDING_DIMENSIONS = 768;

export const PROMPT_VERSIONS = {
  extraction: "extract-v1",
  compare: "compare-v1",
  alert: "alert-v1",
  explain: "explain-v1",
} as const;
