// Evidence-linked alert drafting (Feature 8). The model may only restate reviewed facts,
// every sentence must cite them, and nothing is ever sent automatically.

import { z } from "zod";
import { MODELS, PROMPT_VERSIONS } from "@/config/models";
import { hazardLabel, type RegionConfig } from "@/config/regions";
import type { AlertSection, Citation, Claim, Contradiction, ImpactCandidate, Incident } from "@/lib/domain/schemas";
import { AliasRegistry, checkCitations } from "@/lib/evidence/aliases";
import { formatDateTime } from "@/lib/time";
import { toGeminiSchema } from "./json-schema";
import { unsupportedNumbers } from "./numbers";
import { removeAliasMentions } from "./references";
import { generateStructured } from "./structured";
import { AiUnavailableError, type Llm } from "./types";

const Sentence = z.object({
  text: z.string().describe("One short, plain English sentence."),
  textNe: z.string().describe("The same sentence in Nepali (Devanagari). Empty string when Nepali was not requested."),
  citations: z.array(z.string()).describe("Aliases of the facts this sentence relies on (K1, I2, X1)."),
});

export const alertSchema = z.object({
  headline: Sentence,
  known: z.array(Sentence).describe("Confirmed facts about what happened."),
  whereWhen: z.array(Sentence).describe("Confirmed location and time details."),
  impacts: z.array(Sentence).describe("Possible impacts from the confirmed impact findings (I*). Always say 'possible'."),
  unconfirmed: z.array(Sentence).describe("What is still unconfirmed or contradictory (X*), and what is unknown."),
});

export type AlertSource =
  | { type: "claim"; id: string; claim: Claim; reportedAt?: string }
  | { type: "impact"; id: string; impact: ImpactCandidate }
  | { type: "contradiction"; id: string; contradiction: Contradiction };

export interface AlertInput {
  region: RegionConfig;
  incident: Incident;
  claims: Claim[];
  impacts: ImpactCandidate[];
  contradictions: Contradiction[];
  unknowns: string[];
  languages: Array<"en" | "ne">;
  locationLabel?: string;
  /** Submission time per report id, used to word times correctly. */
  reportTimes?: Record<string, string>;
}

export interface AlertOutcome {
  sections: AlertSection[];
  sources: { claimIds: string[]; impactCandidateIds: string[]; contradictionIds: string[] };
  validation: { removedSentences: number; warnings: string[] };
  model: string;
  promptVersion: string;
  raw: string;
}

const CONFIRMED = new Set(["confirmed", "edited"]);
const SECTION_TITLES: Record<AlertSection["key"], string> = {
  headline: "Headline",
  known: "What is known",
  where_when: "Where and when",
  impacts: "Possible impacts",
  unconfirmed: "Not yet confirmed",
};

export function alertReadiness(input: Pick<AlertInput, "claims">): { ready: boolean; reason?: string } {
  return input.claims.some((c) => CONFIRMED.has(c.review.status))
    ? { ready: true }
    : { ready: false, reason: "Confirm at least one claim before drafting an alert." };
}

const SYSTEM = [
  "You draft a short, evidence-linked situation summary for AapatVani reviewers. A person will check and approve it; it is never sent automatically.",
  "- Use ONLY the facts provided. Every sentence must cite the aliases of the facts it relies on.",
  "- K* facts were confirmed by reviewers. I* are possible impacts computed from map data and confirmed by reviewers: always describe them as possible, never as certain.",
  "- X* are unresolved contradictions. Mention them only in 'unconfirmed'.",
  "- Do not add numbers, places, times, causes, advice or instructions that are not in the cited facts.",
  "- Plain, calm language and short sentences. No speculation and no alarming words.",
  "- When Nepali is requested, write natural Nepali (Devanagari) with the same meaning and citations.",
].join("\n");

function claimText(c: Claim, reportedAt?: string, tz?: string): string {
  return [c.editedStatement, c.statementEn, c.statement, c.excerpt?.text, c.time?.interpretedStart, c.time?.interpretedEnd, reportedAt ? formatDateTime(reportedAt, tz) : undefined]
    .filter(Boolean)
    .join(" | ");
}

function sourceText(s: AlertSource, tz: string): string {
  if (s.type === "claim") return claimText(s.claim, s.reportedAt, tz);
  if (s.type === "impact") return [s.impact.name, s.impact.nameNe, s.impact.explanation].filter(Boolean).join(" | ");
  return s.contradiction.description;
}

export function buildAlertPrompt(input: AlertInput) {
  const { region, incident } = input;
  const aliases = new AliasRegistry<AlertSource>();
  const tz = region.timezone;
  const lines: string[] = [
    `Incident: ${incident.title} · possible hazard: ${hazardLabel(region, incident.hazard.category)} (${incident.hazard.source === "reviewer" ? "confirmed by a reviewer" : "suggested"})`,
    `Reports: ${incident.members.length} (independent sources: ${incident.independentSources}) · first reported ${formatDateTime(incident.firstReportedAt, tz)}, latest ${formatDateTime(incident.lastReportedAt, tz)} (${region.timezone})`,
    ...(input.locationLabel ? [`Location label: ${input.locationLabel}`] : []),
    "",
    "Confirmed facts (reviewed by people):",
  ];
  for (const claim of input.claims.filter((c) => CONFIRMED.has(c.review.status))) {
    const reportedAt = input.reportTimes?.[claim.reportId];
    const alias = aliases.register("K", { type: "claim", id: claim.id, claim, reportedAt });
    const original = claim.statement !== claim.statementEn ? `, original: "${claim.statement}"` : "";
    lines.push(`[${alias}] (${claim.type}) ${claim.editedStatement ?? claim.statementEn}${original}${reportedAt ? ` (reported ${formatDateTime(reportedAt, tz)})` : ""}`);
  }
  const impacts = input.impacts.filter((i) => i.review.status === "confirmed");
  lines.push("", "Possible impacts (computed from OpenStreetMap data, confirmed by a reviewer):");
  if (!impacts.length) lines.push("(none confirmed)");
  for (const impact of impacts) {
    const alias = aliases.register("I", { type: "impact", id: impact.id, impact });
    lines.push(`[${alias}] (${impact.finding.replace(/_/g, " ")}) ${impact.explanation}`);
  }
  const open = input.contradictions.filter((c) => c.status === "open");
  lines.push("", "Unresolved contradictions:");
  if (!open.length) lines.push("(none)");
  for (const contradiction of open) {
    const alias = aliases.register("X", { type: "contradiction", id: contradiction.id, contradiction });
    lines.push(`[${alias}] ${contradiction.description}`);
  }
  if (input.unknowns.length) lines.push("", "Still unknown (no alias; mention only in 'unconfirmed', citing a related fact):", ...input.unknowns.slice(0, 8).map((u) => `- ${u}`));
  lines.push("", `Write the draft in: ${input.languages.includes("ne") ? "English and Nepali" : "English only (leave textNe empty)"}.`);
  return { system: SYSTEM, parts: [{ text: lines.join("\n") }], aliases };
}

export async function draftAlert(input: AlertInput, llm: Llm | null): Promise<AlertOutcome> {
  if (!llm) throw new AiUnavailableError();
  const readiness = alertReadiness(input);
  if (!readiness.ready) throw new Error(readiness.reason);
  const prompt = buildAlertPrompt(input);
  const tz = input.region.timezone;
  const wantNe = input.languages.includes("ne");

  const result = await generateStructured(
    llm,
    {
      model: MODELS.drafting,
      fallbackModel: MODELS.fallback,
      system: prompt.system,
      parts: prompt.parts,
      jsonSchema: toGeminiSchema(alertSchema),
      thinking: "low",
      timeoutMs: 60_000,
    },
    alertSchema,
  );

  const warnings: string[] = [...result.notes];
  let removed = 0;
  const used = { claim: new Set<string>(), impact: new Set<string>(), contradiction: new Set<string>() };

  const check = (s: z.infer<typeof Sentence>, key: AlertSection["key"]) => {
    const { valid, rejected } = checkCitations(prompt.aliases, s.citations);
    const reject = (why: string) => {
      removed++;
      warnings.push(`Removed from "${SECTION_TITLES[key]}": "${s.text.slice(0, 80)}", ${why}.`);
      return null;
    };
    if (rejected.length) warnings.push(`Ignored unknown references ${rejected.join(", ")}.`);
    if (!valid.length) return reject("it cites no known fact");
    if (key !== "unconfirmed" && valid.some((v) => v.type === "contradiction")) return reject("contradictions belong under 'Not yet confirmed'");
    if (key === "impacts" && !valid.some((v) => v.type === "impact")) return reject("it cites no impact finding");
    const sources = valid.map((v) => sourceText(v, tz));
    const text = removeAliasMentions(s.text, ["K", "I", "X"]);
    const textNe = removeAliasMentions(s.textNe, ["K", "I", "X"]);
    if (!text) return reject("it has no text");
    const badNumbers = [...unsupportedNumbers(text, sources), ...(wantNe ? unsupportedNumbers(textNe, sources) : [])];
    if (badNumbers.length) return reject(`it contains numbers not found in its sources (${[...new Set(badNumbers)].join(", ")})`);
    valid.forEach((v) => used[v.type].add(v.id));
    const citations: Citation[] = valid.map((v) => ({ type: v.type, id: v.id }));
    return {
      text: text.slice(0, 400),
      ...(wantNe && textNe ? { textNe: textNe.slice(0, 400) } : {}),
      citations,
    };
  };

  const section = (key: AlertSection["key"], items: Array<z.infer<typeof Sentence>>): AlertSection => ({
    key,
    title: SECTION_TITLES[key],
    sentences: items.map((s) => check(s, key)).filter((s): s is NonNullable<typeof s> => s !== null),
  });

  const sections = [
    section("headline", [result.data.headline]),
    section("known", result.data.known),
    section("where_when", result.data.whereWhen),
    section("impacts", result.data.impacts),
    section("unconfirmed", result.data.unconfirmed),
  ];

  if (!sections[0].sentences.length) {
    const hazardClaim = input.claims.find((c) => c.type === "hazard" && CONFIRMED.has(c.review.status)) ?? input.claims.find((c) => CONFIRMED.has(c.review.status));
    const label = hazardLabel(input.region, input.incident.hazard.category);
    sections[0].sentences = [
      {
        text: `Possible ${label.toLowerCase()}${input.locationLabel ? ` near ${input.locationLabel}` : ""}, reports under review.`,
        citations: hazardClaim ? [{ type: "claim", id: hazardClaim.id }] : [],
      },
    ];
    if (hazardClaim) used.claim.add(hazardClaim.id);
    warnings.push("The headline was written by the system because the model's headline failed the checks.");
  }

  return {
    sections: sections.filter((s) => s.key === "headline" || s.sentences.length),
    sources: { claimIds: [...used.claim], impactCandidateIds: [...used.impact], contradictionIds: [...used.contradiction] },
    validation: { removedSentences: removed, warnings },
    model: result.model,
    promptVersion: PROMPT_VERSIONS.alert,
    raw: result.raw.slice(0, 60_000),
  };
}
