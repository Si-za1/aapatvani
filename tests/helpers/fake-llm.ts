// Test double for the model interface. Replays scripted responses so the validation logic around
// Gemini can be tested deterministically. Never used by the application.

import type { EmbeddingResult, Llm, LlmRequest, LlmResponse } from "@/lib/ai/types";

type Scripted = string | object | Error | ((req: LlmRequest) => string | object);

export class FakeLlm implements Llm {
  readonly backend = "test";
  readonly calls: LlmRequest[] = [];
  embedCalls: string[] = [];

  constructor(
    private readonly script: Scripted[],
    private readonly embedding: (text: string) => number[] | Error = () => [0.6, 0.8],
  ) {}

  async generate(req: LlmRequest): Promise<LlmResponse> {
    this.calls.push(req);
    const next = this.script.shift();
    if (next === undefined) throw new Error("FakeLlm: no scripted response left");
    if (next instanceof Error) throw next;
    const value = typeof next === "function" ? next(req) : next;
    return { text: typeof value === "string" ? value : JSON.stringify(value), model: req.model, latencyMs: 5 };
  }

  async embed(text: string): Promise<EmbeddingResult> {
    this.embedCalls.push(text);
    const v = this.embedding(text);
    if (v instanceof Error) throw v;
    return { vector: v, model: "test-embedding" };
  }

  /** All text sent to the model in a call (system prompt + text parts). */
  promptText(call = 0): string {
    const req = this.calls[call];
    return [req.system, ...req.parts.map((p) => ("text" in p ? p.text : ""))].join("\n");
  }
}
