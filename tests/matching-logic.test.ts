import { describe, expect, it } from "vitest";
import { nepal } from "@/config/regions/nepal";
import type { Claim, Extraction } from "@/lib/domain/schemas";
import { candidateVerdict, pairContext, pairFeatures, reportPoint } from "@/lib/matching/candidates";
import { detectCopy } from "@/lib/matching/copies";
import {
  pairContradictions,
  reportSelfContradictions,
  aiConflictKind,
  contradictionId,
} from "@/lib/matching/contradictions";
import { scorePair } from "@/lib/matching/scoring";
import { cosineSimilarity, shingleSimilarity, reportVerbatimText } from "@/lib/matching/similarity";
import { makeClaim, makeReport } from "./helpers/fixtures";

const LARCHA = { lat: 27.93309, lng: 85.93534 };
const TATOPANI = { lat: 27.9385, lng: 85.9418 };

describe("similarity", () => {
  it("scores identical text as 1 and unrelated text near 0", () => {
    expect(shingleSimilarity("The road is blocked", "The road is blocked")).toBe(1);
    expect(shingleSimilarity("The road is blocked near Larcha", "Sunny weather in Kathmandu today")).toBeLessThan(0.2);
  });

  it("sees through case, punctuation and spacing", () => {
    expect(shingleSimilarity("Road BLOCKED!! at Larcha.", "road   blocked at larcha")).toBe(1);
  });

  it("sees through Devanagari versus ASCII digits", () => {
    expect(shingleSimilarity("बाटो ३ दिन बन्द", "बाटो 3 दिन बन्द")).toBe(1);
  });

  it("returns 0 for text too short to compare, instead of a misleading match", () => {
    expect(shingleSimilarity("ok", "ok")).toBe(0);
  });

  it("computes cosine similarity and refuses mismatched vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    // Different lengths mean different embedding models: never comparable.
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBeNull();
    expect(cosineSimilarity(undefined, [1, 0])).toBeNull();
    expect(cosineSimilarity([0, 0], [1, 0])).toBeNull();
  });
});

describe("verbatim text for copy detection", () => {
  // Regression: the comparable text used to prefer the English translation, which made a forwarded
  // copy look different from its original whenever only one of them had been through extraction.
  const extraction = (overrides: Partial<Extraction> = {}): Extraction =>
    ({
      id: "ext",
      reportId: "r",
      createdAt: "2026-07-14T01:31:00.000Z",
      model: "m",
      promptVersion: "p",
      status: "ok",
      hazardCandidates: [],
      missingInformation: [],
      uncertaintyNotes: [],
      mediaNotes: [],
      claimIds: [],
      validation: { errors: [], warnings: [], droppedClaims: 0, unverifiedExcerpts: 0, citationsChecked: 0, citationsRejected: 0 },
      ...overrides,
    }) as Extraction;

  it("uses the reporter's own words, not the translation", () => {
    const report = makeReport({ id: "a", text: "बाटो पूरै बन्द छ" });
    const withTranslation = extraction({ translationEn: "The road is completely blocked" });

    expect(reportVerbatimText(report, withTranslation)).toBe("बाटो पूरै बन्द छ");
    // The same report compares identically whether or not extraction has run yet.
    expect(reportVerbatimText(report, withTranslation)).toBe(reportVerbatimText(report, undefined));
  });

  it("falls back to the transcript for a voice-only report", () => {
    const report = makeReport({ id: "a", text: "" });
    expect(reportVerbatimText(report, extraction({ transcript: { mediaId: "m1", text: "पहिरो खस्यो" } }))).toBe("पहिरो खस्यो");
  });

  it("flags a copy even when only one side has been extracted", () => {
    const text = "आज बिहान लार्चा नजिक अरनिको राजमार्गमा ठूलो पहिरो खस्यो। बाटो पूरै बन्द छ, सवारी अड्किएका छन्।";
    const original = makeReport({ id: "a", text });
    const forwarded = makeReport({ id: "b", text });
    const extracted = extraction({ translationEn: "A big landslide came down on the Arniko Highway." });

    const score = shingleSimilarity(reportVerbatimText(original, extracted), reportVerbatimText(forwarded, undefined));
    expect(score).toBe(1);
    expect(detectCopy(original, forwarded, score, { distanceKm: 1, effectiveDistanceKm: 1, hoursApart: 1, hazardMatch: "same", semanticSimilarity: null, sharedMedia: false, sameReporter: false }).suspected).toBe(true);
  });
});

describe("report location", () => {
  it("prefers GPS, then a pin, then a gazetteer match", () => {
    const gps = reportPoint(makeReport({ location: { source: "gps", lat: 27.9, lng: 85.9, accuracyM: 12 } }), []);
    expect(gps).toMatchObject({ source: "report_gps", uncertaintyM: 12 });

    const pin = reportPoint(makeReport({ location: { source: "pin", lat: 27.9, lng: 85.9 } }), []);
    expect(pin).toMatchObject({ source: "report_pin" });

    const claim = makeClaim({
      id: "c1",
      reportId: "r1",
      type: "location",
      place: {
        text: "लार्चा",
        resolved: { placeId: "osm:1", name: "Larcha", lat: LARCHA.lat, lng: LARCHA.lng, uncertaintyM: 500, matchType: "exact_ne", datasetId: "np" },
      },
    });
    const viaPlace = reportPoint(makeReport({ location: { source: "place_name", placeText: "लार्चा" } }), [claim]);
    expect(viaPlace).toMatchObject({ source: "gazetteer", basisClaimId: "c1", uncertaintyM: 500 });
  });

  it("returns null rather than guessing when nothing places the report", () => {
    expect(reportPoint(makeReport({ location: { source: "none" } }), [])).toBeNull();
  });

  it("does not place a report from a place the gazetteer found ambiguous", () => {
    const claim = makeClaim({
      id: "c1",
      reportId: "r1",
      type: "location",
      place: {
        text: "Kodari",
        ambiguous: true,
        resolved: { placeId: "osm:1", name: "Kodari", lat: 27.9, lng: 85.9, uncertaintyM: 500, matchType: "fuzzy", datasetId: "np" },
      },
    });
    expect(reportPoint(makeReport({ location: { source: "place_name" } }), [claim])).toBeNull();
  });
});

describe("candidate rule", () => {
  const near = (overrides = {}) =>
    pairContext(
      makeReport({ id: "a", location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng, accuracyM: 20 }, submittedAt: "2026-07-14T01:00:00.000Z", ...overrides }),
      [],
    );

  it("accepts two nearby reports of the same hazard", () => {
    const a = pairContext(makeReport({ id: "a", reporterHazard: "landslide", location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng }, submittedAt: "2026-07-14T01:00:00.000Z" }), []);
    const b = pairContext(makeReport({ id: "b", reporterHazard: "landslide", location: { source: "gps", lat: TATOPANI.lat, lng: TATOPANI.lng }, submittedAt: "2026-07-14T02:00:00.000Z" }), []);
    expect(candidateVerdict(a, b, nepal, pairFeatures(a, b, nepal))).toEqual({ candidate: true });
  });

  it("rejects a pair more than 24 h apart", () => {
    const a = near();
    const b = pairContext(makeReport({ id: "b", location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng }, submittedAt: "2026-07-16T01:00:00.000Z" }), []);
    const verdict = candidateVerdict(a, b, nepal, pairFeatures(a, b, nepal));
    expect(verdict.candidate).toBe(false);
    if (!verdict.candidate) expect(verdict.reason).toMatch(/24 h/);
  });

  it("rejects a pair whose hazards are known to be different", () => {
    const a = pairContext(makeReport({ id: "a", reporterHazard: "landslide", location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng }, submittedAt: "2026-07-14T01:00:00.000Z" }), []);
    const b = pairContext(makeReport({ id: "b", reporterHazard: "fire", location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng }, submittedAt: "2026-07-14T01:00:00.000Z" }), []);
    const verdict = candidateVerdict(a, b, nepal, pairFeatures(a, b, nepal));
    expect(verdict.candidate).toBe(false);
    if (!verdict.candidate) expect(verdict.reason).toMatch(/hazard/);
  });

  it("counts location uncertainty before applying the radius", () => {
    // 4 km apart, but both are place-name matches with 2 km uncertainty: within the effective radius.
    const a = pairContext(makeReport({ id: "a", location: { source: "gps", lat: 27.93, lng: 85.935, accuracyM: 2000 }, submittedAt: "2026-07-14T01:00:00.000Z" }), []);
    const b = pairContext(makeReport({ id: "b", location: { source: "gps", lat: 27.966, lng: 85.935, accuracyM: 2000 }, submittedAt: "2026-07-14T01:00:00.000Z" }), []);
    const features = pairFeatures(a, b, nepal);
    expect(features.distanceKm).toBeGreaterThan(3.9);
    expect(features.effectiveDistanceKm).toBeLessThan(1);
    expect(candidateVerdict(a, b, nepal, features)).toEqual({ candidate: true });
  });
});

describe("copy detection", () => {
  const features = { distanceKm: 1, effectiveDistanceKm: 1, hoursApart: 1, hazardMatch: "same", semanticSimilarity: null, sharedMedia: false, sameReporter: false } as const;

  it("flags near-identical text", () => {
    const text = "The landslide has covered the Arniko Highway near Larcha this morning. The road is completely blocked.";
    const verdict = detectCopy(makeReport({ id: "a", text }), makeReport({ id: "b", text }), shingleSimilarity(text, text), features);
    expect(verdict.suspected).toBe(true);
    expect(verdict.reasons.join(" ")).toMatch(/Near-identical wording/);
  });

  it("flags a shared photo hash and says why", () => {
    const shared = { ...features, sharedMedia: true };
    const media = [
      { id: "m1", kind: "photo" as const, mimeType: "image/jpeg", sizeBytes: 10, sha256: "abc123def456", storagePath: "p" },
    ];
    const verdict = detectCopy(makeReport({ id: "a", media }), makeReport({ id: "b", media }), 0, shared);
    expect(verdict.suspected).toBe(true);
    expect(verdict.reasons.join(" ")).toMatch(/SHA-256/);
  });

  it("does not flag short identical texts", () => {
    const verdict = detectCopy(makeReport({ id: "a", text: "road blocked" }), makeReport({ id: "b", text: "road blocked" }), 1, features);
    expect(verdict.suspected).toBe(false);
  });

  it("flags the same device token", () => {
    const verdict = detectCopy(
      makeReport({ id: "a", reporterToken: "same" }),
      makeReport({ id: "b", reporterToken: "same" }),
      0,
      { ...features, sameReporter: true },
    );
    expect(verdict.reasons.join(" ")).toMatch(/same anonymous device/);
  });
});

describe("scoring", () => {
  const base = { distanceKm: 0, effectiveDistanceKm: 0, hoursApart: 0, semanticSimilarity: 1, sharedMedia: false, sameReporter: false } as const;

  it("scores an identical, simultaneous, co-located pair highest", () => {
    const breakdown = scorePair({ ...base, hazardMatch: "same" }, 1);
    expect(breakdown.total).toBeCloseTo(1, 5);
    expect(breakdown.unavailable).toEqual([]);
  });

  it("renormalises over available signals and names the missing ones", () => {
    const breakdown = scorePair({ ...base, hazardMatch: "same", semanticSimilarity: null }, 1);
    expect(breakdown.total).toBeCloseTo(1, 5);
    expect(breakdown.unavailable).toContain("meaning");
  });

  it("scores an unknown hazard below a matching one", () => {
    const same = scorePair({ ...base, hazardMatch: "same" }, 0);
    const unknown = scorePair({ ...base, hazardMatch: "unknown" }, 0);
    expect(unknown.total).toBeLessThan(same.total);
  });

  it("shows its working: every part contributes and the parts sum to the total", () => {
    const breakdown = scorePair({ ...base, hazardMatch: "compatible" }, 0.5);
    const sum = breakdown.parts.reduce((acc, p) => acc + p.contribution, 0);
    expect(sum).toBeCloseTo(breakdown.total, 6);
    expect(breakdown.parts.map((p) => p.label)).toEqual(["Distance", "Time", "Hazard", "Meaning", "Wording"]);
  });
});

describe("rule contradictions", () => {
  // Uses the real context builder, so the test cannot drift from what matching actually passes in.
  const ctx = (report: ReturnType<typeof makeReport>, claims: Claim[]) => pairContext(report, claims);

  it("flags locations further apart than both radii plus a kilometre", () => {
    const a = ctx(makeReport({ id: "a", location: { source: "gps", lat: 27.93, lng: 85.935, accuracyM: 100 } }), []);
    const b = ctx(makeReport({ id: "b", location: { source: "gps", lat: 27.98, lng: 85.935, accuracyM: 100 } }), []);
    const drafts = pairContradictions(a, b, pairFeatures(a, b, nepal));
    expect(drafts.map((d) => d.kind)).toContain("location");
  });

  it("does not flag locations that agree within their accuracy", () => {
    const a = ctx(makeReport({ id: "a", location: { source: "gps", lat: 27.93, lng: 85.935, accuracyM: 2000 } }), []);
    const b = ctx(makeReport({ id: "b", location: { source: "gps", lat: 27.95, lng: 85.935, accuracyM: 2000 } }), []);
    expect(pairContradictions(a, b, pairFeatures(a, b, nepal)).map((d) => d.kind)).not.toContain("location");
  });

  it("flags event times more than six hours apart", () => {
    const morning = makeClaim({
      id: "ca",
      reportId: "a",
      type: "time",
      time: { text: "6am", interpretedStart: "2026-07-14T00:15:00.000Z", interpretedEnd: "2026-07-14T01:00:00.000Z" },
    });
    const evening = makeClaim({
      id: "cb",
      reportId: "b",
      type: "time",
      time: { text: "7pm", interpretedStart: "2026-07-14T13:15:00.000Z", interpretedEnd: "2026-07-14T14:00:00.000Z" },
    });
    const a = ctx(makeReport({ id: "a" }), [morning]);
    const b = ctx(makeReport({ id: "b" }), [evening]);
    const drafts = pairContradictions(a, b, pairFeatures(a, b, nepal));
    expect(drafts.map((d) => d.kind)).toContain("time");
  });

  it("treats overlapping time windows as agreement", () => {
    const w1 = makeClaim({ id: "ca", reportId: "a", type: "time", time: { text: "morning", interpretedStart: "2026-07-14T00:00:00.000Z", interpretedEnd: "2026-07-14T04:00:00.000Z" } });
    const w2 = makeClaim({ id: "cb", reportId: "b", type: "time", time: { text: "today", interpretedStart: "2026-07-14T03:00:00.000Z", interpretedEnd: "2026-07-14T06:00:00.000Z" } });
    const a = ctx(makeReport({ id: "a" }), [w1]);
    const b = ctx(makeReport({ id: "b" }), [w2]);
    expect(pairContradictions(a, b, pairFeatures(a, b, nepal)).map((d) => d.kind)).not.toContain("time");
  });

  it("flags blocked versus open on the same road", () => {
    const blocked = makeClaim({ id: "ca", reportId: "a", type: "impact_road", roadStatus: "blocked", roadName: "Arniko Highway" });
    const open = makeClaim({ id: "cb", reportId: "b", type: "impact_road", roadStatus: "passable", roadName: "Araniko Rajmarg" });
    const a = ctx(makeReport({ id: "a" }), [blocked]);
    const b = ctx(makeReport({ id: "b" }), [open]);
    const drafts = pairContradictions(a, b, pairFeatures(a, b, nepal));
    expect(drafts.map((d) => d.kind)).toContain("road_status");
  });

  it("does not flag blocked versus open on different roads", () => {
    const blocked = makeClaim({ id: "ca", reportId: "a", type: "impact_road", roadStatus: "blocked", roadName: "Arniko Highway" });
    const open = makeClaim({ id: "cb", reportId: "b", type: "impact_road", roadStatus: "passable", roadName: "Jiri Road" });
    const a = ctx(makeReport({ id: "a" }), [blocked]);
    const b = ctx(makeReport({ id: "b" }), [open]);
    expect(pairContradictions(a, b, pairFeatures(a, b, nepal)).map((d) => d.kind)).not.toContain("road_status");
  });

  it("flags conflicting counts of the same kind of people", () => {
    const three = makeClaim({ id: "ca", reportId: "a", type: "impact_people", people: { kind: "injured", count: 3 } });
    const one = makeClaim({ id: "cb", reportId: "b", type: "impact_people", people: { kind: "injured", count: 1 } });
    const a = ctx(makeReport({ id: "a" }), [three]);
    const b = ctx(makeReport({ id: "b" }), [one]);
    expect(pairContradictions(a, b, pairFeatures(a, b, nepal)).map((d) => d.kind)).toContain("people_count");
  });

  it("flags a photo taken long before the report was submitted", () => {
    const report = makeReport({
      id: "a",
      submittedAt: "2026-07-14T01:00:00.000Z",
      media: [
        {
          id: "m1",
          kind: "photo",
          mimeType: "image/jpeg",
          sizeBytes: 10,
          sha256: "x",
          storagePath: "p",
          exif: { takenAt: "2026-07-01T01:00:00.000Z" },
        },
      ],
    });
    const drafts = reportSelfContradictions({ report, claims: [], point: null });
    expect(drafts.map((d) => d.kind)).toContain("photo_time");
  });

  it("flags a photo whose EXIF location is far from the reported location", () => {
    const report = makeReport({
      id: "a",
      location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng },
      media: [
        {
          id: "m1",
          kind: "photo",
          mimeType: "image/jpeg",
          sizeBytes: 10,
          sha256: "x",
          storagePath: "p",
          exif: { gps: { lat: 27.7, lng: 85.3 } },
        },
      ],
    });
    const drafts = reportSelfContradictions({ report, claims: [], point: reportPoint(report, []) });
    expect(drafts.map((d) => d.kind)).toContain("photo_location");
  });

  it("maps model conflict kinds onto the shared taxonomy", () => {
    expect(aiConflictKind("road_status")).toBe("road_status");
    expect(aiConflictKind("description")).toBe("semantic");
    expect(aiConflictKind("something_new")).toBe("semantic");
  });

  it("gives a contradiction a stable id, so re-running does not duplicate it", () => {
    const draft = { kind: "location" as const, detectedBy: "rule" as const, description: "x", reportIds: ["b", "a"], claimIds: ["c2", "c1"] };
    const reordered = { ...draft, reportIds: ["a", "b"], claimIds: ["c1", "c2"] };
    expect(contradictionId(draft)).toBe(contradictionId(reordered));
  });
});
