import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { EMBEDDING_DIMENSIONS, MODELS } from "@/config/models";
import { AiCallError, type EmbeddingResult, type Llm, type LlmRequest, type LlmResponse } from "./types";

// Gemini through the official Google Gen AI SDK, server-side only.
//   Agent Platform (recommended on Cloud Run): GOOGLE_GENAI_USE_ENTERPRISE=true + GOOGLE_CLOUD_PROJECT
//     (+ GOOGLE_CLOUD_LOCATION, default "global"); authenticates with the service account.
//   Gemini Developer API: GEMINI_API_KEY (or GOOGLE_API_KEY).

export type GeminiBackend = { backend: "agent-platform" | "gemini-api" | "none"; project?: string; location?: string };

export function geminiBackend(): GeminiBackend {
  const e = process.env;
  const enterprise = e.GOOGLE_GENAI_USE_ENTERPRISE === "true" || e.GOOGLE_GENAI_USE_VERTEXAI === "true";
  const project = e.GOOGLE_CLOUD_PROJECT ?? e.GCLOUD_PROJECT;
  if (enterprise && project) return { backend: "agent-platform", project, location: e.GOOGLE_CLOUD_LOCATION ?? "global" };
  if (e.GEMINI_API_KEY || e.GOOGLE_API_KEY) return { backend: "gemini-api" };
  return { backend: "none" };
}

const LEVELS = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH } as const;
const RETRYABLE_STATUS = new Set([404, 408, 429, 500, 502, 503, 504]);

function toCallError(err: unknown, model: string): AiCallError {
  if (err instanceof AiCallError) return err;
  const e = err as { status?: number; name?: string; message?: string };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    return new AiCallError(`The model did not answer in time (${model}).`, 408, model, true);
  }
  const status = typeof e?.status === "number" ? e.status : undefined;
  const retryable = status === undefined || RETRYABLE_STATUS.has(status);
  return new AiCallError(e?.message ?? String(err), status, model, retryable);
}

function normalise(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? values.map((v) => v / norm) : values;
}

class GeminiLlm implements Llm {
  constructor(
    private readonly ai: GoogleGenAI,
    readonly backend: string,
  ) {}

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const models = req.fallbackModel && req.fallbackModel !== req.model ? [req.model, req.fallbackModel] : [req.model];
    let last: AiCallError | undefined;
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const started = Date.now();
      try {
        const res = await this.ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: req.parts }],
          config: {
            systemInstruction: req.system,
            responseMimeType: "application/json",
            responseJsonSchema: req.jsonSchema,
            // Thinking levels are tuned for the primary model; the fallback uses its defaults.
            ...(req.thinking && i === 0 ? { thinkingConfig: { thinkingLevel: LEVELS[req.thinking] } } : {}),
            abortSignal: AbortSignal.timeout(req.timeoutMs ?? 90_000),
          },
        });
        const text = res.text ?? "";
        if (!text.trim()) throw new AiCallError(`${model} returned an empty response.`, undefined, model, true);
        return {
          text,
          model,
          latencyMs: Date.now() - started,
          usage: { inputTokens: res.usageMetadata?.promptTokenCount, outputTokens: res.usageMetadata?.candidatesTokenCount },
        };
      } catch (err) {
        last = toCallError(err, model);
        if (!last.retryable || i === models.length - 1) throw last;
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    throw last ?? new AiCallError("No model available.");
  }

  async embed(text: string): Promise<EmbeddingResult> {
    try {
      const res = await this.ai.models.embedContent({
        model: MODELS.embedding,
        contents: text,
        config: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
          taskType: "SEMANTIC_SIMILARITY",
          abortSignal: AbortSignal.timeout(30_000),
        },
      });
      const values = res.embeddings?.[0]?.values;
      if (!values?.length) throw new AiCallError("The embedding model returned no vector.", undefined, MODELS.embedding);
      // Truncated (768-d) Gemini embeddings must be normalised before cosine comparison.
      return { vector: normalise(values), model: MODELS.embedding };
    } catch (err) {
      throw toCallError(err, MODELS.embedding);
    }
  }
}

/** What the UI shows about the AI connection. Never includes secrets. */
export function aiStatus() {
  const cfg = geminiBackend();
  return {
    configured: cfg.backend !== "none",
    backend: cfg.backend,
    label:
      cfg.backend === "agent-platform"
        ? `Gemini via Agent Platform (${cfg.location})`
        : cfg.backend === "gemini-api"
          ? "Gemini Developer API"
          : "Gemini not configured",
    models: MODELS,
  };
}

let cached: { key: string; llm: Llm } | undefined;

/** The configured Gemini client, or null when no credentials are set. */
export function getLlm(): Llm | null {
  const cfg = geminiBackend();
  if (cfg.backend === "none") return null;
  const key = `${cfg.backend}:${cfg.project ?? ""}:${cfg.location ?? ""}`;
  if (cached?.key === key) return cached.llm;
  const ai =
    cfg.backend === "agent-platform"
      ? new GoogleGenAI({ enterprise: true, project: cfg.project, location: cfg.location })
      : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY });
  cached = { key, llm: new GeminiLlm(ai, cfg.backend) };
  return cached.llm;
}
