import { describe, expect, it } from "vitest";
import { nepal } from "@/config/regions/nepal";
import { buildExtractionPrompt, runExtraction, type ExtractionInput } from "@/lib/ai/extraction";
import { AiCallError, AiUnavailableError } from "@/lib/ai/types";
import type { MediaItem } from "@/lib/domain/schemas";
import { FakeLlm } from "./helpers/fake-llm";
import { GAZETTEER, makeReport } from "./helpers/fixtures";

const PHOTO: MediaItem = {
  id: "med_PHOTO0001",
  kind: "photo",
  mimeType: "image/jpeg",
  sizeBytes: 4,
  sha256: "abc",
  storagePath: "reports/rep_TESTREPORT0001/med_PHOTO0001.jpg",
};
const AUDIO: MediaItem = { ...PHOTO, id: "med_AUDIO0001", kind: "audio", mimeType: "audio/wav", durationSec: 12, storagePath: "x.wav" };

function input(overrides: Partial<ExtractionInput> = {}): ExtractionInput {
  return {
    report: makeReport({ media: [PHOTO] }),
    media: [{ item: PHOTO, data: Buffer.from([1, 2, 3, 4]) }],
    region: nepal,
    gazetteer: { datasetId: "np-araniko-corridor", entries: GAZETTEER },
    ...overrides,
  };
}

const MODEL_OUTPUT = {
  detectedLanguage: "ne",
  translationEn: "A big landslide fell on the Araniko Highway near Larcha in the morning. The road is completely blocked. 3 people are injured.",
  hazardCandidates: [{ category: "landslide", rationale: "The report says a landslide fell.", basis: "report_text" }],
  claims: [
    { type: "event", statement: "ठूलो पहिरो खस्यो", statementEn: "A big landslide fell", source: "report_text", sourceAlias: "R1", excerpt: "ठूलो पहिरो खस्यो", hazardCategory: "landslide", certainty: "high" },
    { type: "impact_road", statement: "बाटो पूरै बन्द छ", statementEn: "The road is completely blocked", source: "report_text", sourceAlias: "R1", excerpt: "बाटो पूरै बन्द छ", roadStatus: "blocked", roadName: "अरनिको राजमार्ग", certainty: "high" },
    { type: "impact_people", statement: "३ जना घाइते", statementEn: "3 people injured", source: "report_text", sourceAlias: "R1", excerpt: "३ जना घाइते भएका छन्", peopleKind: "injured", peopleCount: 3, certainty: "medium" },
    { type: "impact_structure", statement: "पुल भत्कियो", statementEn: "A bridge collapsed", source: "report_text", sourceAlias: "R1", excerpt: "पुल भत्कियो", certainty: "low" },
    { type: "observation", statement: "Debris covers the road", statementEn: "Debris covers a paved road", source: "photo", sourceAlias: "M1", excerpt: "", roadStatus: "blocked", certainty: "medium" },
    { type: "observation", statement: "A river", statementEn: "A second photo shows a river", source: "photo", sourceAlias: "M2", excerpt: "", certainty: "low" },
    { type: "event", statement: "Trucks stuck", statementEn: "Trucks are stuck", source: "report_text", sourceAlias: "rep_123", excerpt: "truck", certainty: "low" },
  ],
  placeMentions: [
    { text: "लार्चा", romanized: "Larcha", kind: "settlement", sourceAlias: "R1" },
    { text: "अरनिको राजमार्ग", romanized: "Araniko Rajmarg", kind: "road", sourceAlias: "R1" },
    { text: "काभ्रे", romanized: "Kabhre", kind: "settlement", sourceAlias: "R1" },
  ],
  timeMentions: [
    { text: "आज बिहान ६ बजे", textEn: "today at 6 in the morning", interpretedStart: "2026-07-14T06:00:00+05:45", sourceAlias: "R1" },
    { text: "बिहान", textEn: "in the morning", interpretedStart: "2099-01-01T00:00:00Z", sourceAlias: "R1" },
  ],
  mediaNotes: [
    { alias: "M1", relevance: "shows_hazard", note: "Debris on a road" },
    { alias: "M7", relevance: "unclear", note: "unknown photo" },
  ],
  missingInformation: ["Exact location along the highway"],
  uncertaintyNotes: [],
};

describe("extraction prompt", () => {
  it("uses aliases and never exposes record ids or asks for coordinates", () => {
    const prompt = buildExtractionPrompt(input());
    const text = [prompt.system, ...prompt.parts.map((p) => ("text" in p ? p.text : ""))].join("\n");
    expect(text).toContain("R1, report text, verbatim");
    expect(text).toContain("- M1: photo");
    expect(text).not.toContain("rep_TESTREPORT0001");
    expect(text).not.toContain("med_PHOTO0001");
    expect(text).toContain("Never output coordinates");
    expect(prompt.parts.some((p) => "inlineData" in p && p.inlineData.mimeType === "image/jpeg")).toBe(true);
  });

  it("skips media that would exceed the request size limit", () => {
    const big = Buffer.alloc(19 * 1024 * 1024);
    const prompt = buildExtractionPrompt(input({ media: [{ item: PHOTO, data: big }] }));
    expect(prompt.aliases.has("M1")).toBe(false);
    expect(prompt.skipped[0]).toContain("request size limit");
  });
});

describe("extraction checks", () => {
  it("keeps verified reporter claims, downgrades unverifiable ones and drops invented references", async () => {
    const llm = new FakeLlm([MODEL_OUTPUT]);
    const { extraction, claims } = await runExtraction(input(), llm);
    expect(extraction.status).toBe("ok");
    expect(extraction.claimIds).toEqual(claims.map((c) => c.id));

    const byEn = (s: string) => claims.find((c) => c.statementEn.startsWith(s))!;
    const event = byEn("A big landslide");
    expect(event.origin).toBe("reporter");
    expect(event.excerpt).toMatchObject({ verified: true, field: "text", text: "ठूलो पहिरो खस्यो" });

    const road = byEn("The road is completely blocked");
    expect(road).toMatchObject({ origin: "reporter", roadStatus: "blocked", roadName: "अरनिको राजमार्ग" });

    expect(byEn("3 people injured").people).toEqual({ kind: "injured", count: 3 });

    const bridge = byEn("A bridge collapsed");
    expect(bridge.origin).toBe("ai");
    expect(bridge.excerpt?.verified).toBe(false);

    const photo = byEn("Debris covers");
    expect(photo).toMatchObject({ origin: "ai", basis: "photo", mediaId: "med_PHOTO0001" });
    expect(photo.roadStatus).toBeUndefined();

    expect(claims.some((c) => c.statementEn.includes("river"))).toBe(false);
    expect(claims.some((c) => c.statementEn.includes("Trucks"))).toBe(false);
    expect(extraction.validation.droppedClaims).toBe(2);
    expect(extraction.validation.citationsRejected).toBe(2);
    expect(extraction.validation.unverifiedExcerpts).toBe(2);
    expect(extraction.mediaNotes).toEqual([{ mediaId: "med_PHOTO0001", relevance: "shows_hazard", note: "Debris on a road" }]);
  });

  it("resolves places through the gazetteer and flags ambiguity instead of guessing", async () => {
    const { claims } = await runExtraction(input(), new FakeLlm([MODEL_OUTPUT]));
    const larcha = claims.find((c) => c.type === "location" && c.place?.text === "लार्चा")!;
    expect(larcha.origin).toBe("reporter");
    expect(larcha.place?.resolved).toMatchObject({ name: "Larcha", matchType: "exact_ne", datasetId: "np-araniko-corridor" });

    const highway = claims.find((c) => c.place?.kind === "road")!;
    expect(highway.roadName).toBe("Araniko Rajmarg");
    expect(highway.place?.resolved).toBeUndefined();

    const kabhre = claims.find((c) => c.place?.text === "काभ्रे")!;
    expect(kabhre.origin).toBe("ai");
    expect(kabhre.place?.ambiguous).toBe(true);
    expect(kabhre.place?.candidates).toHaveLength(2);
    expect(kabhre.place?.resolved).toBeUndefined();
  });

  it("keeps verbatim times and discards impossible interpretations", async () => {
    const { claims } = await runExtraction(input(), new FakeLlm([MODEL_OUTPUT]));
    const times = claims.filter((c) => c.type === "time");
    expect(times[0].time).toEqual({ text: "आज बिहान ६ बजे", interpretedStart: "2026-07-14T00:15:00.000Z" });
    expect(times[0].origin).toBe("reporter");
    expect(times[1].time).toEqual({ text: "बिहान" });
  });

  it("turns the AI's hazard category into a reviewable AI claim", async () => {
    const { claims } = await runExtraction(input(), new FakeLlm([MODEL_OUTPUT]));
    const hazard = claims.find((c) => c.type === "hazard")!;
    expect(hazard).toMatchObject({ origin: "ai", basis: "inference", hazardCategory: "landslide" });
    expect(hazard.review.status).toBe("unreviewed");
  });

  it("removes people counts that the quoted words do not state", async () => {
    const output = structuredClone(MODEL_OUTPUT);
    output.claims[2].peopleCount = 5;
    const { claims, extraction } = await runExtraction(input(), new FakeLlm([output]));
    expect(claims.find((c) => c.type === "impact_people")?.people).toEqual({ kind: "injured" });
    expect(extraction.validation.warnings.join(" ")).toContain("count of 5 was removed");
  });

  it("checks voice-note excerpts against the transcript", async () => {
    const output = {
      ...MODEL_OUTPUT,
      transcript: { text: "तातोपानी जाने बाटो पहिरोले थुनियो", language: "ne" },
      claims: [
        { type: "impact_road", statement: "बाटो पहिरोले थुनियो", statementEn: "The road was blocked by a landslide", source: "voice_note", sourceAlias: "A1", excerpt: "बाटो पहिरोले थुनियो", roadStatus: "blocked", certainty: "high" },
        { type: "need", statement: "खाना चाहियो", statementEn: "Food is needed", source: "voice_note", sourceAlias: "A1", excerpt: "खाना चाहियो", certainty: "low" },
      ],
      placeMentions: [],
      timeMentions: [],
      mediaNotes: [],
    };
    const report = makeReport({ text: "", media: [AUDIO] });
    const { extraction, claims } = await runExtraction(
      input({ report, media: [{ item: AUDIO, data: Buffer.from([1, 2]) }] }),
      new FakeLlm([output]),
    );
    expect(extraction.transcript).toEqual({ mediaId: "med_AUDIO0001", text: "तातोपानी जाने बाटो पहिरोले थुनियो", language: "ne" });
    expect(claims[0]).toMatchObject({ origin: "reporter", basis: "voice_note", mediaId: "med_AUDIO0001" });
    expect(claims[0].excerpt?.field).toBe("transcript");
    expect(claims[1].origin).toBe("ai");
  });

  it("sends a browser-recorded voice note, whose type carries parameters", async () => {
    // Regression, and a headline feature failing quietly. `MediaRecorder` reports what it produced,
    // `audio/webm;codecs=opus`, and the parameters are not part of the media type. Matching the raw
    // string against an allow-list meant the app accepted the upload at intake and then skipped the
    // audio on its way to the model, so no transcript was ever produced — the one thing a voice
    // note exists for. The MIME type is normalised before it is matched, and `audio/webm` is in
    // the list.
    const browserAudio: MediaItem = { ...AUDIO, id: "med_WEBM0001", mimeType: "audio/webm;codecs=opus" };
    const output = {
      ...MODEL_OUTPUT,
      transcript: { text: "तातोपानी जाने बाटो पहिरोले थुनियो", language: "ne" },
      claims: [],
      placeMentions: [],
      timeMentions: [],
      mediaNotes: [],
    };
    const report = makeReport({ text: "", media: [browserAudio] });
    const { extraction } = await runExtraction(
      input({ report, media: [{ item: browserAudio, data: Buffer.from([1, 2, 3]) }] }),
      new FakeLlm([output]),
    );

    expect(extraction.validation.warnings.join(" ")).not.toContain("unsupported format");
    expect(extraction.transcript?.text).toBe("तातोपानी जाने बाटो पहिरोले थुनियो");
  });

  it("stores the embedding, and survives an embedding failure", async () => {
    const ok = await runExtraction(input(), new FakeLlm([MODEL_OUTPUT]));
    expect(ok.extraction.embedding).toEqual([0.6, 0.8]);
    const failing = await runExtraction(input(), new FakeLlm([MODEL_OUTPUT], () => new Error("quota")));
    expect(failing.extraction.status).toBe("ok");
    expect(failing.extraction.embedding).toBeUndefined();
    expect(failing.extraction.validation.warnings.join(" ")).toContain("Embedding failed");
  });

  it("says which voice note a transcript belongs to when there is more than one", async () => {
    // The schema carries a single transcript, so with two recordings it can only be attributed to
    // one. Binding it silently let a claim rest on the wrong recording with nothing on screen to say
    // so; the warning is what sends a reviewer to the other audio.
    const second: MediaItem = { ...AUDIO, id: "med_AUDIO0002", storagePath: "y.wav" };
    const output = {
      ...MODEL_OUTPUT,
      transcript: { text: "तातोपानी जाने बाटो पहिरोले थुनियो", language: "ne" },
      claims: [],
      placeMentions: [],
      timeMentions: [],
      mediaNotes: [],
    };
    const report = makeReport({ text: "", media: [AUDIO, second] });
    const { extraction } = await runExtraction(
      input({
        report,
        media: [
          { item: AUDIO, data: Buffer.from([1]) },
          { item: second, data: Buffer.from([2]) },
        ],
      }),
      new FakeLlm([output]),
    );

    expect(extraction.validation.warnings.join(" ")).toContain("2 voice notes");
    expect(extraction.transcript?.mediaId).toBe("med_AUDIO0001");
  });

  it("embeds a voice-only report from its transcript, which is all it has", async () => {
    // Regression: there is no text to translate, so `translationEn` comes back empty and the old
    // fallback chain ran out at `report.text`, which is also empty. The report got no embedding and
    // could only ever be matched on distance and time, for exactly the reporters who cannot write.
    const output = {
      ...MODEL_OUTPUT,
      translationEn: "",
      transcript: { text: "तातोपानी जाने बाटो पहिरोले थुनियो", language: "ne" },
      claims: [],
      placeMentions: [],
      timeMentions: [],
      mediaNotes: [],
    };
    const report = makeReport({ text: "", media: [AUDIO] });
    const llm = new FakeLlm([output]);
    const { extraction } = await runExtraction(input({ report, media: [{ item: AUDIO, data: Buffer.from([1, 2]) }] }), llm);

    expect(extraction.embedding).toEqual([0.6, 0.8]);
    expect(llm.embedCalls).toEqual(["तातोपानी जाने बाटो पहिरोले थुनियो"]);
  });

  it("records a failed extraction instead of throwing when the model misbehaves", async () => {
    const invalid = await runExtraction(input(), new FakeLlm(["nope", "{\"still\": \"wrong\"}"]));
    expect(invalid.extraction.status).toBe("failed");
    expect(invalid.extraction.raw).toContain("still");
    expect(invalid.claims).toHaveLength(0);

    const down = await runExtraction(input(), new FakeLlm([new AiCallError("503 overloaded", 503, "gemini-3.8-flash")]));
    expect(down.extraction.status).toBe("failed");
    expect(down.extraction.error).toContain("503 overloaded");
  });

  it("refuses to run without a configured model", async () => {
    await expect(runExtraction(input(), null)).rejects.toBeInstanceOf(AiUnavailableError);
  });
});
