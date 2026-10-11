// The narrow model interface the rest of the app depends on. The production implementation is
// Gemini (lib/ai/gemini.ts). Tests substitute a scripted model to exercise validation paths;
// the app itself never fabricates model output.

export type LlmPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export type ThinkingLevelName = "low" | "medium" | "high";

export interface LlmRequest {
  model: string;
  /** Tried once if the primary model is unavailable, rate-limited or times out. */
  fallbackModel?: string;
  system: string;
  parts: LlmPart[];
  /** JSON Schema for the response (Gemini `responseJsonSchema`). */
  jsonSchema: Record<string, unknown>;
  thinking?: ThinkingLevelName;
  timeoutMs?: number;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmResponse {
  text: string;
  /** The model that actually answered (may be the fallback). */
  model: string;
  latencyMs: number;
  usage?: LlmUsage;
}

export interface EmbeddingResult {
  vector: number[];
  model: string;
}

export interface Llm {
  /** "agent-platform" | "gemini-api" | a test name. */
  readonly backend: string;
  generate(request: LlmRequest): Promise<LlmResponse>;
  embed(text: string): Promise<EmbeddingResult>;
}

/** Gemini is not configured (no API key and no Agent Platform project). */
export class AiUnavailableError extends Error {
  override name = "AiUnavailableError";
  constructor(message = "Gemini is not configured. Set GEMINI_API_KEY, or GOOGLE_GENAI_USE_ENTERPRISE with GOOGLE_CLOUD_PROJECT.") {
    super(message);
  }
}

/** The model call itself failed (network, quota, timeout, server error). */
export class AiCallError extends Error {
  override name = "AiCallError";
  constructor(
    message: string,
    readonly status?: number,
    readonly model?: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

/** The model answered, but its output failed schema validation even after one corrective retry. */
export class AiOutputError extends Error {
  override name = "AiOutputError";
  constructor(
    message: string,
    readonly issues: string[],
    readonly raw: string,
    readonly model: string,
  ) {
    super(message);
  }
}
