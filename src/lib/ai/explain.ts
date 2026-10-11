// Plain-language explanation of a computed impact assessment (should-have S7).
// Gemini may only restate what the deterministic analysis found; anything else is rejected.

import { z } from "zod";
import { MODELS, PROMPT_VERSIONS } from "@/config/models";
import type { RegionConfig } from "@/config/regions";
import type { ImpactAssessment, ImpactCandidate } from "@/lib/domain/schemas";
import { AliasRegistry, checkCitations } from "@/lib/evidence/aliases";
import { toGeminiSchema } from "./json-schema";
import { unsupportedNumbers } from "./numbers";
import { rewriteAliases } from "./references";
import { generateStructured } from "./structured";
import { AiUnavailableError, type Llm } from "./types";

export const explainSchema = z.object({
  summary: z.string().describe("Three to five short sentences in plain English. Refer to findings by alias, e.g. I1."),
  citations: z.array(z.string()).describe("Aliases of the findings the summary relies on."),
});

export interface ExplainOutcome {
  text: string;
  model: string;
  promptVersion: string;
  citedCandidateIds: string[];
  accepted: boolean;
  rejectionReason?: string;
}

const SYSTEM = [
  "You explain the results of a road-access analysis to disaster-response reviewers in plain language.",
  "- Restate only what the findings say. Do not add places, numbers, causes, predictions or advice.",
  "- These are possible impacts based on map data, not confirmed facts. Say so.",
  "- Never say that any place is safe or unaffected. Never estimate casualties, damage or hazard extent.",
  "- Cite findings by alias (I1, I2 …). Never invent aliases.",
].join("\n");

const SAFE_CLAIM = /\b(is|are|remains?|stays?)\s+(safe|unaffected|not affected|out of danger)\b|\bno risk\b|\bnot at risk\b/i;
const OUT_OF_SCOPE = /\b(killed|deaths?|died|casualt\w*|injur\w*|fatalit\w*|destroyed|damage to buildings)\b/i;

export function buildExplainPrompt(assessment: Pick<ImpactAssessment, "statusMessage" | "warnings" | "candidates">) {
  const aliases = new AliasRegistry<ImpactCandidate>();
  const top = [...assessment.candidates].sort((a, b) => b.severity - a.severity).slice(0, 12);
  const lines = [`Analysis status: ${assessment.statusMessage}`, "", "Findings:"];
  for (const c of top) {
    const alias = aliases.register("I", c);
    lines.push(`[${alias}] (${c.finding.replace(/_/g, " ")}) ${c.explanation}`);
  }
  lines.push("", "Caveats:", ...assessment.warnings.map((w) => `- ${w}`));
  return { system: SYSTEM, parts: [{ text: lines.join("\n") }], aliases, sources: [assessment.statusMessage, ...assessment.warnings, ...top.map((c) => c.explanation)] };
}

export async function explainImpact(
  assessment: Pick<ImpactAssessment, "statusMessage" | "warnings" | "candidates">,
  _region: RegionConfig,
  llm: Llm | null,
): Promise<ExplainOutcome> {
  if (!llm) throw new AiUnavailableError();
  const prompt = buildExplainPrompt(assessment);
  const result = await generateStructured(
    llm,
    {
      model: MODELS.drafting,
      fallbackModel: MODELS.fallback,
      system: prompt.system,
      parts: prompt.parts,
      jsonSchema: toGeminiSchema(explainSchema),
      thinking: "low",
      timeoutMs: 45_000,
    },
    explainSchema,
  );

  const base = { model: result.model, promptVersion: PROMPT_VERSIONS.explain };
  const cited = checkCitations(prompt.aliases, result.data.citations);
  const rewritten = rewriteAliases(result.data.summary, prompt.aliases, ["I"]);
  const reject = (reason: string): ExplainOutcome => ({ ...base, text: rewritten.text, citedCandidateIds: [], accepted: false, rejectionReason: reason });

  if (cited.rejected.length || rewritten.rejected.length) return reject(`It referred to findings that do not exist (${[...new Set([...cited.rejected, ...rewritten.rejected])].join(", ")}).`);
  if (!cited.valid.length) return reject("It did not cite any finding.");
  const numbers = unsupportedNumbers(rewritten.text, prompt.sources);
  if (numbers.length) return reject(`It contained numbers that are not in the analysis (${numbers.join(", ")}).`);
  if (SAFE_CLAIM.test(result.data.summary)) return reject("It described a place as safe, which the analysis can never establish.");
  if (OUT_OF_SCOPE.test(result.data.summary)) return reject("It mentioned casualties or damage, which the analysis does not estimate.");

  return { ...base, text: rewritten.text, citedCandidateIds: cited.valid.map((c) => c.id), accepted: true };
}
