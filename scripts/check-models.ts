/**
 * Verifies that the configured Gemini models are available to this key/project and that
 * structured output and embeddings work. Run after adding credentials:
 *
 *   npm run check:models
 *
 * Reads .env.local if present. Makes a handful of tiny requests (a few hundred tokens in total).
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { MODELS } from "../src/config/models";
import { geminiBackend, getLlm } from "../src/lib/ai/gemini";
import { toGeminiSchema } from "../src/lib/ai/json-schema";
import { generateStructured } from "../src/lib/ai/structured";

async function main() {
  const cfg = geminiBackend();
  if (cfg.backend === "none") {
    console.error("Gemini is not configured. Set GEMINI_API_KEY, or GOOGLE_GENAI_USE_ENTERPRISE=true and GOOGLE_CLOUD_PROJECT (see .env.example).");
    process.exit(1);
  }
  console.log(`Backend: ${cfg.backend}${cfg.project ? ` · project ${cfg.project} · location ${cfg.location}` : ""}`);

  const ai =
    cfg.backend === "agent-platform"
      ? new GoogleGenAI({ enterprise: true, project: cfg.project, location: cfg.location })
      : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY });

  const wanted = [...new Set(Object.values(MODELS))];
  const available = new Set<string>();
  try {
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    for await (const model of pager) {
      const name = model.name ?? "";
      available.add(name.split("/").pop() ?? name);
    }
    console.log(`\nModels listed for this key/project: ${available.size}`);
    for (const id of wanted) console.log(`  ${available.has(id) ? "✓" : "?"} ${id}${available.has(id) ? "" : "  (not in the list, the test call below is the real check)"}`);
  } catch (err) {
    console.warn(`Could not list models (${(err as Error).message}); continuing with test calls.`);
  }

  const llm = getLlm()!;
  const schema = z.object({ ok: z.boolean(), language: z.string() });
  let failures = 0;
  for (const model of [...new Set([MODELS.extraction, MODELS.reasoning, MODELS.drafting, MODELS.fallback])]) {
    try {
      const res = await generateStructured(
        llm,
        {
          model,
          system: "Answer the question as JSON.",
          parts: [{ text: 'Is "नमस्ते" Nepali? Reply with ok=true if so, and its language code.' }],
          jsonSchema: toGeminiSchema(schema),
          timeoutMs: 30_000,
        },
        schema,
      );
      console.log(`  ✓ ${model} structured output in ${res.latencyMs} ms → ${JSON.stringify(res.data)}`);
    } catch (err) {
      failures++;
      console.error(`  ✗ ${model}: ${(err as Error).message}`);
    }
  }
  try {
    const { vector, model } = await llm.embed("पहिरोले अरनिको राजमार्ग अवरुद्ध");
    console.log(`  ✓ ${model} embedding with ${vector.length} dimensions`);
  } catch (err) {
    failures++;
    console.error(`  ✗ ${MODELS.embedding}: ${(err as Error).message}`);
  }
  if (failures) {
    console.error(`\n${failures} check(s) failed. Override model IDs with GEMINI_MODEL_* variables if needed.`);
    process.exit(1);
  }
  console.log("\nAll Gemini checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
