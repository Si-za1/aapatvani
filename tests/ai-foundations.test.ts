import { describe, expect, it } from "vitest";
import { z } from "zod";
import { nepal } from "@/config/regions/nepal";
import { alertSchema } from "@/lib/ai/alerts";
import { compareSchema } from "@/lib/ai/compare";
import { explainSchema } from "@/lib/ai/explain";
import { extractionSchema } from "@/lib/ai/extraction";
import { schemaKeys, toGeminiSchema } from "@/lib/ai/json-schema";
import { numbersIn, unsupportedNumbers } from "@/lib/ai/numbers";
import { removeAliasMentions, rewriteAliases, splitReferences } from "@/lib/ai/references";
import { generateStructured, parseModelJson } from "@/lib/ai/structured";
import { AiOutputError } from "@/lib/ai/types";
import { AliasRegistry } from "@/lib/evidence/aliases";
import { FakeLlm } from "./helpers/fake-llm";

const GEMINI_KEYWORDS = new Set(["type", "properties", "required", "items", "enum", "description", "title", "minItems", "maxItems", "minimum", "maximum", "format", "additionalProperties"]);

describe("Gemini response schemas", () => {
  it.each([
    ["extraction", extractionSchema(nepal)],
    ["compare", compareSchema],
    ["alert", alertSchema],
    ["explain", explainSchema],
  ])("%s schema uses only keywords Gemini supports", (_name, schema) => {
    const json = toGeminiSchema(schema as z.ZodType);
    for (const key of schemaKeys(json)) expect(GEMINI_KEYWORDS.has(key), `unexpected keyword ${key}`).toBe(true);
    expect(json.type).toBe("object");
  });

  it("restricts hazards to the region's list", () => {
    const json = toGeminiSchema(extractionSchema(nepal)) as { properties: Record<string, { items: { properties: { category: { enum: string[] } } } }> };
    expect(json.properties.hazardCandidates.items.properties.category.enum).toEqual(nepal.hazards.map((h) => h.id));
  });

  it("never asks the model for coordinates", () => {
    const text = JSON.stringify(toGeminiSchema(extractionSchema(nepal)));
    expect(text).not.toMatch(/"(lat|lng|latitude|longitude|coordinates)"/);
  });
});

describe("structured generation", () => {
  const schema = z.object({ ok: z.boolean() });
  const request = { model: "m", system: "s", parts: [{ text: "q" }], jsonSchema: {} };

  it("accepts valid JSON, including fenced output", async () => {
    expect(parseModelJson('```json\n{"ok":true}\n```')).toEqual({ ok: true, value: { ok: true } });
    const res = await generateStructured(new FakeLlm([{ ok: true }]), request, schema);
    expect(res.data).toEqual({ ok: true });
    expect(res.attempts).toBe(1);
  });

  it("retries once with the validation problems", async () => {
    const llm = new FakeLlm(["{not json", { ok: true }]);
    const res = await generateStructured(llm, request, schema);
    expect(res.attempts).toBe(2);
    expect(res.notes).toHaveLength(1);
    const retryText = llm.calls[1].parts.map((p) => ("text" in p ? p.text : "")).join("\n");
    expect(retryText).toContain("did not match the required JSON schema");
  });

  it("rejects output that fails twice, keeping the raw text for audit", async () => {
    const llm = new FakeLlm([{ ok: "yes" }, { ok: "still no" }]);
    const err = await generateStructured(llm, request, schema).catch((e) => e);
    expect(err).toBeInstanceOf(AiOutputError);
    expect((err as AiOutputError).raw).toContain("still no");
  });
});

describe("number and reference guards", () => {
  it("normalises numbers across scripts and formats", () => {
    expect(numbersIn("३ जना, 3,154 people, 23.0 km, ward 5")).toEqual(["3", "3154", "23", "5"]);
    expect(unsupportedNumbers("23 km and 40 km", ["The route grows to 23 km"])).toEqual(["40"]);
    expect(unsupportedNumbers("२३ किमी", ["23 km"])).toEqual([]);
  });

  it("removes inline alias mentions from display text", () => {
    expect(removeAliasMentions("Road blocked near Larcha (K1, K2).", ["K", "I", "X"])).toBe("Road blocked near Larcha.");
    expect(removeAliasMentions("Tatopani [I1] may lose access, see X1.", ["K", "I", "X"])).toBe("Tatopani may lose access, see.");
    expect(removeAliasMentions("Arniko Highway (NH34) is blocked.", ["K", "I", "X"])).toBe("Arniko Highway (NH34) is blocked.");
    expect(removeAliasMentions("लार्चा नजिक बाटो बन्द (K1)।", ["K"])).toBe("लार्चा नजिक बाटो बन्द।");
  });

  it("rewrites aliases to record references and drops unknown ones", () => {
    const reg = new AliasRegistry<{ id: string }>();
    reg.register("A", { id: "clm_1" });
    const out = rewriteAliases("A1 and [A7] agree, but A1 is vague.", reg, ["A"]);
    expect(out.text).toBe("[[clm_1]] and agree, but [[clm_1]] is vague.");
    expect(out.rejected).toEqual(["A7"]);
    expect(splitReferences(out.text)).toEqual([{ ref: "clm_1" }, { text: " and agree, but " }, { ref: "clm_1" }, { text: " is vague." }]);
  });
});
