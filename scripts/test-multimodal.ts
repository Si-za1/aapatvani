/**
 * Runs the real extraction against reports that carry a photo and a voice note.
 *
 *   npm run test:multimodal
 *
 * Why this exists: the evaluation never sends media. `lib/eval/run.ts` calls `runExtraction` with
 * `media: []`, so the photo and voice-note paths, the alias registry for M1/A1, the transcript
 * check and the `basis: "photo"` / `basis: "voice_note"` provenance rules have never run against
 * a real model. This script sends the fixtures in `data/eval/media/` through the same
 * `runExtraction` the app uses and prints what came back.
 *
 * It is metered. Calls go through the quota guard in `lib/ai/quota.ts`, so it paces itself and
 * stops at the daily budget rather than discovering the free tier's ceiling with a 429.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getRegion } from "@/config/regions";
import { getLlm } from "@/lib/ai/gemini";
import { runExtraction } from "@/lib/ai/extraction";
import { guardLlm, readQuotaState, QuotaBudgetError } from "@/lib/ai/quota";
import type { Llm } from "@/lib/ai/types";
import type { MediaItem, Report } from "@/lib/domain/schemas";
import { loadDataset } from "@/lib/geo/dataset";
import { newId, newReferenceCode } from "@/lib/ids";

const MEDIA_DIR = path.join(process.cwd(), "data", "eval", "media");

async function mediaItem(opts: {
  file: string;
  id: string;
  kind: "photo" | "audio";
  mimeType: string;
  attribution: string;
}): Promise<{ item: MediaItem; data: Buffer }> {
  const data = await readFile(path.join(MEDIA_DIR, opts.file));
  const item: MediaItem = {
    id: opts.id,
    kind: opts.kind,
    mimeType: opts.mimeType,
    sizeBytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    storagePath: `eval/${opts.file}`,
    originalName: opts.file,
    attribution: opts.attribution,
    // 16 kHz, 16-bit mono PCM behind a 44-byte WAV header.
    ...(opts.kind === "audio" ? { durationSec: Math.round(((data.length - 44) / (16_000 * 2)) * 10) / 10 } : {}),
  };
  return { item, data };
}

const ILLUSTRATION_NOTE = "Illustration synthesised for this prototype. Not a photograph of a real event.";
const VOICE_NOTE = "Speech synthesised on this device (macOS 'Lekha' voice) for this prototype.";

const NEPALI_TEXT =
  "आज बिहान अरनिको राजमार्गमा पहिरो गएको छ। लार्चा नजिकै बाटो पूरै अवरुद्ध भएको छ। कुनै सवारी साधन आउजाउ गर्न सकेको छैन।";

interface Case {
  id: string;
  what: string;
  text: string;
  withPhoto: boolean;
  withVoice: boolean;
}

const CASES: Case[] = [
  { id: "text+photo", what: "Nepali text and a photo (§12 R1)", text: NEPALI_TEXT, withPhoto: true, withVoice: false },
  { id: "voice only", what: "a voice note with no text at all", text: "", withPhoto: false, withVoice: true },
  { id: "text+photo+voice", what: "everything the form can send at once", text: NEPALI_TEXT, withPhoto: true, withVoice: true },
];

function buildReport(c: Case, media: MediaItem[]): Report {
  return {
    id: newId("rep"),
    referenceCode: newReferenceCode(),
    regionId: "np",
    dataLabel: "synthetic",
    text: c.text,
    uiLanguage: "ne",
    location: { source: "place_name", placeText: "Larcha", lat: 27.9385, lng: 85.9418, accuracyM: 500 },
    timeHint: "earlier_today",
    submittedAt: new Date("2026-07-14T02:15:00.000Z").toISOString(),
    media,
    reporterToken: "synthetic-test-token",
    status: "received",
  };
}

function show(c: Case, report: Report, outcome: Awaited<ReturnType<typeof runExtraction>>): boolean {
  const { extraction: ex, claims } = outcome;
  console.log(`\n${"─".repeat(78)}\nCASE ${c.id}  ·  ${c.what}\n${"─".repeat(78)}`);
  console.log(`  report text: ${report.text ? `${report.text.slice(0, 60)}…` : "(none)"}`);
  console.log(`  media sent:  ${report.media.map((m) => `${m.id} ${m.kind} ${m.mimeType}`).join(", ") || "none"}`);

  if (ex.status !== "ok") {
    console.log(`  ✗ extraction FAILED after ${ex.latencyMs ?? "?"} ms\n    ${ex.error ?? "no error recorded"}`);
    return false;
  }

  console.log(`  ✓ ${ex.model} in ${ex.latencyMs} ms · tokens in ${ex.usage?.inputTokens ?? "?"} / out ${ex.usage?.outputTokens ?? "?"}`);
  console.log(`  language: ${ex.detectedLanguage}`);
  if (ex.translationEn) console.log(`  translation: ${ex.translationEn.slice(0, 160)}`);
  if (ex.transcript) console.log(`  TRANSCRIPT (${ex.transcript.language}): ${ex.transcript.text}`);
  if (ex.hazardCandidates.length) console.log(`  hazards: ${ex.hazardCandidates.map((h) => `${h.category}(${h.basis})`).join(", ")}`);

  console.log(`  claims: ${claims.length}`);
  for (const cl of claims) {
    const bits = [
      cl.type.padEnd(14),
      `origin=${cl.origin}`.padEnd(13),
      `basis=${cl.basis}`.padEnd(20),
      cl.excerpt ? `excerpt=${cl.excerpt.verified ? "verified" : "UNVERIFIED"}` : "excerpt=none",
    ];
    console.log(`    · ${bits.join(" ")}  ${cl.statementEn.slice(0, 70)}`);
  }

  for (const n of ex.mediaNotes) console.log(`  mediaNote ${n.mediaId}: ${n.relevance} — ${n.note}`);
  for (const m of ex.missingInformation.slice(0, 4)) console.log(`  missing: ${m}`);
  for (const w of ex.validation.warnings.slice(0, 6)) console.log(`  warning: ${w}`);

  // The provenance rules this script exists to check.
  const photoClaims = claims.filter((cl) => cl.basis === "photo");
  const voiceClaims = claims.filter((cl) => cl.basis === "voice_note");
  const problems: string[] = [];
  if (photoClaims.some((cl) => cl.origin !== "ai")) problems.push("a photo claim was not labelled AI interpretation");
  if (voiceClaims.some((cl) => !cl.excerpt?.verified)) problems.push("a voice claim quoted words that are not in the transcript");
  if (ex.transcript && !report.media.some((m) => m.kind === "audio")) problems.push("a transcript came back with no audio attached");

  console.log(`  ── photo claims ${photoClaims.length} · voice claims ${voiceClaims.length} · transcript ${ex.transcript ? "yes" : "no"}`);
  if (problems.length) {
    console.log(`  ✗ PROVENANCE: ${problems.join("; ")}`);
    return false;
  }
  console.log(`  ✓ provenance rules held`);
  return true;
}

async function main(): Promise<void> {
  const base = getLlm();
  if (!base) {
    console.error("Gemini is not configured. Add GEMINI_API_KEY to .env.local (see .env.example).");
    process.exit(1);
  }

  const state = readQuotaState();
  console.log(`Quota for ${state.day} (Pacific): budget ${state.budget}/model/day`);
  if (Object.keys(state.counts).length) {
    for (const [model, n] of Object.entries(state.counts).sort()) console.log(`  already used today: ${model} ${n}`);
  } else {
    console.log("  nothing counted yet today");
  }
  console.log(`  3 cases × (1 extraction + 1 embedding) = up to 6 requests, spaced 12 s apart.\n`);

  const dataset = await loadDataset("np-araniko-corridor");
  const gazetteer = dataset ? { datasetId: "np-araniko-corridor", entries: dataset.gazetteer } : null;
  const region = getRegion("np");

  let calls = 0;
  const llm: Llm = guardLlm(base, {
    onCall: (info) => {
      calls++;
      console.log(
        `  [call ${calls}] ${info.kind} → ${info.answered} (${info.countForAnswered} today) ` +
          `${info.latencyMs} ms${info.waitedMs > 500 ? ` after waiting ${Math.round(info.waitedMs / 1000)} s` : ""}`,
      );
    },
  });

  const photo = await mediaItem({ file: "landslide-larcha.png", id: "med_photo_larcha", kind: "photo", mimeType: "image/png", attribution: ILLUSTRATION_NOTE });
  const voice = await mediaItem({ file: "voice-landslide-larcha.wav", id: "med_voice_larcha", kind: "audio", mimeType: "audio/wav", attribution: VOICE_NOTE });
  console.log(`Fixtures: ${photo.item.originalName} (${(photo.data.length / 1024).toFixed(0)} KB) · ${voice.item.originalName} (${(voice.data.length / 1024).toFixed(0)} KB, ${voice.item.durationSec} s)`);

  let passed = 0;
  for (const c of CASES) {
    const media = [...(c.withPhoto ? [photo] : []), ...(c.withVoice ? [voice] : [])];
    const report = buildReport(c, media.map((m) => m.item));
    try {
      const outcome = await runExtraction({ report, media, region, gazetteer }, llm);
      if (show(c, report, outcome)) passed++;
    } catch (err) {
      if (err instanceof QuotaBudgetError) {
        console.error(`\n${err.message}`);
        break;
      }
      console.error(`\nCASE ${c.id} threw: ${(err as Error).message}`);
    }
  }

  console.log(`\n${"─".repeat(78)}\n${passed}/${CASES.length} cases passed · ${calls} model requests used\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
