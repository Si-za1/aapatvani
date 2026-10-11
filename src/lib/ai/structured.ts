import type { z } from "zod";
import { AiOutputError, type Llm, type LlmRequest, type LlmUsage } from "./types";

// Calls the model for JSON, validates it with Zod, and retries once with the validation
// problems fed back. Anything that still fails is rejected — never patched up silently.

export interface StructuredResult<T> {
  data: T;
  raw: string;
  model: string;
  latencyMs: number;
  usage: LlmUsage;
  attempts: number;
  notes: string[];
}

type Parsed = { ok: true; value: unknown } | { ok: false; error: string };

export function parseModelJson(text: string): Parsed {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function describeIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 12).map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`);
}

function addUsage(a: LlmUsage, b?: LlmUsage): LlmUsage {
  return {
    inputTokens: (a.inputTokens ?? 0) + (b?.inputTokens ?? 0) || undefined,
    outputTokens: (a.outputTokens ?? 0) + (b?.outputTokens ?? 0) || undefined,
  };
}

export async function generateStructured<T>(llm: Llm, request: LlmRequest, schema: z.ZodType<T>): Promise<StructuredResult<T>> {
  const notes: string[] = [];
  let usage: LlmUsage = {};
  let latencyMs = 0;
  let current = request;
  let lastRaw = "";
  let lastModel = request.model;
  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await llm.generate(current);
    usage = addUsage(usage, res.usage);
    latencyMs += res.latencyMs;
    lastRaw = res.text;
    lastModel = res.model;
    const parsed = parseModelJson(res.text);
    if (parsed.ok) {
      const check = schema.safeParse(parsed.value);
      if (check.success) {
        return { data: check.data, raw: res.text, model: res.model, latencyMs, usage, attempts: attempt, notes };
      }
      lastIssues = describeIssues(check.error);
    } else {
      lastIssues = [`Response was not valid JSON (${parsed.error})`];
    }
    notes.push(`Attempt ${attempt} failed validation: ${lastIssues.join("; ")}`);
    current = {
      ...request,
      parts: [
        ...request.parts,
        {
          text:
            "Your previous response did not match the required JSON schema:\n- " +
            lastIssues.join("\n- ") +
            "\nReturn the complete, corrected JSON object only.",
        },
      ],
    };
  }
  throw new AiOutputError("The model's output failed validation twice.", lastIssues, lastRaw, lastModel);
}
