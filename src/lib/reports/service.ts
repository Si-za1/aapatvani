import "server-only";

// Report intake and extraction (project.md §6 steps 1–2, features M1–M3).
//
// The order is deliberate: the report is validated, stored and given a reference code *before* any
// model call. If Gemini is slow, fails or is not configured at all, the reporter's words are already
// safe and the reviewer still sees the original.

import { getRegion } from "@/config/regions";
import { z } from "zod";
import { aiActor, publicActor, recordAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import type { Claim, Extraction, MediaItem, Report } from "@/lib/domain/schemas";
import { newId, newReferenceCode, newSecret, sha256Hex } from "@/lib/ids";
import { getEnv } from "@/lib/env";
import { runExtraction } from "@/lib/ai/extraction";
import { AiUnavailableError, type Llm } from "@/lib/ai/types";
import { loadDataset } from "@/lib/geo/dataset";
import { getMediaStore } from "@/lib/storage";

export class SubmissionError extends Error {}

/** Cloud Run caps HTTP/1 requests at 32 MiB, so these stay well inside it. */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const MAX_MEDIA_ITEMS = 4;
export const MAX_TEXT_LENGTH = 4_000;
/** Whole-request ceiling, checked before the body is read. */
export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
/** Anonymous, random, per-device token. It identifies a browser, never a person. */
export const REPORTER_COOKIE = "av_reporter";

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-m4a", "video/webm"]);

export const submissionSchema = z
  .object({
    text: z.string().max(MAX_TEXT_LENGTH).default(""),
    uiLanguage: z.enum(["en", "ne"]).default("ne"),
    reporterHazard: z.string().max(64).optional(),
    locationSource: z.enum(["gps", "pin", "place_name", "none"]).default("none"),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    accuracyM: z.coerce.number().min(0).max(100_000).optional(),
    placeText: z.string().max(200).optional(),
    timeHint: z.enum(["now", "earlier_today", "yesterday", "unsure"]).optional(),
    reportedTimeText: z.string().max(200).optional(),
    clientTransform: z.string().max(200).optional(),
  })
  .refine((v) => (v.locationSource === "gps" || v.locationSource === "pin") === (v.lat !== undefined && v.lng !== undefined), {
    message: "A GPS or pin location needs both latitude and longitude; other sources must not send coordinates.",
  })
  .refine((v) => v.locationSource !== "place_name" || Boolean(v.placeText?.trim()), {
    message: "A place-name location needs the place name.",
  });

export type Submission = z.infer<typeof submissionSchema>;

export interface IntakeResult {
  report: Report;
  /** Handed to the browser so only it can trigger extraction for this report. */
  submitToken: string;
  reporterToken: string;
}

function extensionFor(mime: string, originalName: string | undefined): string {
  const fromName = originalName?.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "audio/webm": "webm",
    "video/webm": "webm",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
  };
  return map[mime] ?? "bin";
}

/** Reads whatever EXIF the browser left in a photo. Never shown to the public, never trusted blindly. */
async function readExif(buffer: Buffer, mime: string): Promise<MediaItem["exif"]> {
  if (!mime.startsWith("image/")) return undefined;
  try {
    const exifr = (await import("exifr")).default;
    const parsed = (await exifr.parse(buffer, { gps: true, tiff: true, exif: true })) as
      | { DateTimeOriginal?: Date; CreateDate?: Date; Make?: string; Model?: string; latitude?: number; longitude?: number }
      | undefined;
    if (!parsed) return undefined;
    const taken = parsed.DateTimeOriginal ?? parsed.CreateDate;
    const camera = [parsed.Make, parsed.Model].filter(Boolean).join(" ");
    const exif: NonNullable<MediaItem["exif"]> = {};
    if (taken instanceof Date && !Number.isNaN(taken.getTime())) exif.takenAt = taken.toISOString();
    if (typeof parsed.latitude === "number" && typeof parsed.longitude === "number") {
      exif.gps = { lat: parsed.latitude, lng: parsed.longitude };
    }
    if (camera) exif.cameraModel = camera.slice(0, 80);
    return Object.keys(exif).length ? exif : undefined;
  } catch {
    // A photo with no readable EXIF is normal. It is not an error and must not block the report.
    return undefined;
  }
}

export async function createReport(form: FormData, reporterToken: string): Promise<IntakeResult> {
  const db = getDb();
  const env = getEnv();

  const raw = Object.fromEntries(
    [...form.entries()].filter(([, value]) => typeof value === "string").map(([key, value]) => [key, String(value).trim()]),
  ) as Record<string, string>;
  for (const key of ["lat", "lng", "accuracyM"]) if (raw[key] === "") delete raw[key];
  if (raw.reporterHazard === "") delete raw.reporterHazard;

  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SubmissionError(parsed.error.issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`).join("; "));
  }
  const input = parsed.data;

  const files = form.getAll("media").filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length > MAX_MEDIA_ITEMS) throw new SubmissionError(`Attach at most ${MAX_MEDIA_ITEMS} files.`);
  if (!input.text.trim() && files.length === 0) {
    throw new SubmissionError("Write something or attach a photo or voice note.");
  }

  const reportId = newId("rep");
  const media: MediaItem[] = [];
  const store = getMediaStore();

  for (const file of files) {
    const mime = file.type || "application/octet-stream";
    const isPhoto = PHOTO_TYPES.has(mime);
    const isAudio = AUDIO_TYPES.has(mime);
    if (!isPhoto && !isAudio) throw new SubmissionError(`Unsupported file type: ${mime}. Send a photo or a voice note.`);

    const limit = isPhoto ? MAX_PHOTO_BYTES : MAX_AUDIO_BYTES;
    if (file.size > limit) {
      throw new SubmissionError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${limit / 1024 / 1024} MB.`);
    }

    const data = Buffer.from(await file.arrayBuffer());
    const mediaId = newId("med");
    const objectPath = `reports/${reportId}/${mediaId}.${extensionFor(mime, file.name)}`;
    await store.put(objectPath, data, mime);

    const exif = await readExif(data, mime);
    media.push({
      id: mediaId,
      kind: isPhoto ? "photo" : "audio",
      mimeType: mime,
      sizeBytes: data.length,
      sha256: sha256Hex(data),
      storagePath: objectPath,
      ...(file.name ? { originalName: file.name.slice(0, 120) } : {}),
      ...(input.clientTransform ? { clientTransform: input.clientTransform } : {}),
      ...(exif ? { exif } : {}),
    });
  }

  const report: Report = {
    id: reportId,
    referenceCode: newReferenceCode(),
    regionId: env.defaultRegionId,
    dataLabel: env.defaultDataLabel,
    text: input.text.trim(),
    uiLanguage: input.uiLanguage,
    ...(input.reporterHazard ? { reporterHazard: input.reporterHazard } : {}),
    location: {
      source: input.locationSource,
      ...(input.lat !== undefined ? { lat: input.lat } : {}),
      ...(input.lng !== undefined ? { lng: input.lng } : {}),
      ...(input.accuracyM !== undefined ? { accuracyM: input.accuracyM } : {}),
      ...(input.placeText ? { placeText: input.placeText } : {}),
    },
    ...(input.timeHint ? { timeHint: input.timeHint } : {}),
    ...(input.reportedTimeText ? { reportedTimeText: input.reportedTimeText } : {}),
    submittedAt: new Date().toISOString(),
    media,
    reporterToken,
    status: "received",
  };

  const submitToken = newSecret();
  await db.reports.create({ ...report, submitTokenHash: sha256Hex(submitToken) });
  await recordAudit({
    actor: publicActor(reporterToken),
    action: "report.submitted",
    targetType: "report",
    targetId: report.id,
    reportId: report.id,
    summary: `Report ${report.referenceCode} received (${media.length} attachment${media.length === 1 ? "" : "s"}).`,
  });

  return { report, submitToken, reporterToken };
}

export interface ExtractionRunResult {
  report: Report;
  extraction: Extraction | null;
  aiAvailable: boolean;
  message: string;
}

/**
 * Runs extraction and stores the result. Never loses the report: a model failure produces a
 * `failed` extraction record and a status the reviewer can see, and the original is untouched.
 */
export async function runExtractionForReport(reportId: string, llm: Llm | null): Promise<ExtractionRunResult> {
  const db = getDb();
  const report = await db.reports.get(reportId);
  if (!report) throw new Error(`Report ${reportId} not found`);

  const region = getRegion(report.regionId);
  await db.reports.update(reportId, { status: "extracting" });

  const datasets = await loadDataset(region.datasetIds[0]);
  const media = await Promise.all(
    report.media.map(async (item) => ({ item, data: (await getMediaStore().get(item.storagePath)) ?? Buffer.alloc(0) })),
  );

  let outcome;
  try {
    outcome = await runExtraction({ report, media: media.filter((m) => m.data.length), region, gazetteer: datasets ? { datasetId: datasets.manifest.id, entries: datasets.gazetteer } : null }, llm);
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      await db.reports.update(reportId, {
        status: "ai_unavailable",
        statusDetail: "Gemini is not configured on this deployment. The report is stored and can be extracted once it is.",
      });
      await recordAudit({
        actor: publicActor(report.reporterToken),
        action: "extraction.unavailable",
        targetType: "report",
        targetId: reportId,
        reportId,
        summary: "Extraction skipped: no model credentials configured.",
      });
      return {
        report: (await db.reports.get(reportId))!,
        extraction: null,
        aiAvailable: false,
        message: "Saved. AI reading is not configured on this deployment, so a reviewer will read it directly.",
      };
    }
    throw err;
  }

  await db.extractions.create(outcome.extraction);
  for (const claim of outcome.claims) await db.claims.create(claim);

  const ok = outcome.extraction.status === "ok";
  const updated = await db.reports.update(reportId, {
    status: ok ? "extracted" : "extraction_failed",
    latestExtractionId: outcome.extraction.id,
    ...(ok ? {} : { statusDetail: outcome.extraction.error ?? "Extraction failed." }),
  });

  await recordAudit({
    actor: ok ? aiActor(outcome.extraction.model) : publicActor(report.reporterToken),
    action: ok ? "extraction.completed" : "extraction.failed",
    targetType: "extraction",
    targetId: outcome.extraction.id,
    reportId,
    summary: ok
      ? `Extracted ${outcome.claims.length} claim${outcome.claims.length === 1 ? "" : "s"} from ${report.referenceCode}.`
      : `Extraction failed for ${report.referenceCode}: ${outcome.extraction.error}`,
  });

  return {
    report: updated,
    extraction: outcome.extraction,
    aiAvailable: true,
    message: ok ? "Extraction complete." : "Extraction failed; the original report is unchanged.",
  };
}

export interface ReportBundle {
  report: Report;
  extraction: Extraction | null;
  claims: Claim[];
}

export async function reportBundle(reportId: string): Promise<ReportBundle | null> {
  const db = getDb();
  const report = await db.reports.get(reportId);
  if (!report) return null;
  const [extraction, claims] = await Promise.all([
    report.latestExtractionId ? db.extractions.get(report.latestExtractionId) : Promise.resolve(null),
    db.claims.list({ where: [{ field: "reportId", op: "==", value: reportId }] }),
  ]);
  return { report, extraction, claims };
}

/** True when the request carries the secret handed to the submitting browser. */
export function submitTokenMatches(report: Report, token: string | null | undefined): boolean {
  if (!report.submitTokenHash || !token) return false;
  return sha256Hex(token) === report.submitTokenHash;
}
