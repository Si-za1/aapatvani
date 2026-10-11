import { describe, expect, it } from "vitest";
import { nepal } from "@/config/regions/nepal";
import { alertReadiness, draftAlert, type AlertInput } from "@/lib/ai/alerts";
import type { Contradiction, ImpactCandidate, Incident } from "@/lib/domain/schemas";
import { FakeLlm } from "./helpers/fake-llm";
import { makeClaim } from "./helpers/fixtures";

const incident: Incident = {
  id: "inc_1",
  regionId: "np",
  dataLabel: "synthetic",
  title: "Landslide near Larcha",
  hazard: { category: "landslide", source: "reviewer" },
  status: "under_review",
  members: [{ reportId: "rep_A", membership: "confirmed", addedBy: "system", addedAt: "2026-07-14T01:31:00Z" }],
  reportIds: ["rep_A"],
  firstReportedAt: "2026-07-14T01:30:00Z",
  lastReportedAt: "2026-07-14T02:10:00Z",
  independentSources: 2,
  openContradictions: 1,
  createdAt: "2026-07-14T01:31:00Z",
  updatedAt: "2026-07-14T02:10:00Z",
  createdBy: "system",
};
const confirmed = { status: "confirmed" as const, by: { id: "u1", name: "Sita" }, at: "2026-07-14T03:00:00Z" };
const impact: ImpactCandidate = {
  id: "imp_1",
  key: "settlement:osm:node/1",
  kind: "settlement_access",
  finding: "lost_access",
  severity: 4,
  name: "Tatopani",
  lat: 27.94,
  lng: 85.95,
  metrics: { beforeM: 23000 },
  explanation: "On the mapped road network, the nearest health facility for Tatopani is Keystone Hospital (23 km by road).",
  caveats: [],
  reliesOnClaimIds: ["clm_road"],
  review: confirmed,
};
const contradiction: Contradiction = {
  id: "con_1",
  regionId: "np",
  incidentId: "inc_1",
  reportIds: ["rep_A", "rep_B"],
  claimIds: ["clm_road", "clm_open"],
  kind: "road_status",
  detectedBy: "rule",
  description: "One report says the road is fully blocked; another says one lane is open.",
  fingerprint: "f",
  status: "open",
  createdAt: "2026-07-14T02:11:00Z",
};

function baseInput(languages: Array<"en" | "ne"> = ["en", "ne"]): AlertInput {
  return {
    region: nepal,
    incident,
    claims: [
      makeClaim({ id: "clm_road", reportId: "rep_A", type: "impact_road", statementEn: "A landslide blocked the Araniko Highway near Larcha", review: confirmed }),
      makeClaim({ id: "clm_place", reportId: "rep_A", type: "location", statementEn: "Place mentioned: Larcha", review: confirmed }),
      makeClaim({ id: "clm_unreviewed", reportId: "rep_A", statementEn: "Three trucks are stuck" }),
    ],
    impacts: [impact, { ...impact, id: "imp_2", name: "Kodari", review: { status: "unreviewed" } }],
    contradictions: [contradiction],
    unknowns: ["Whether anyone is hurt"],
    languages,
    locationLabel: "Larcha",
    reportTimes: { rep_A: "2026-07-14T01:30:00Z" },
  };
}

const S = (text: string, citations: string[], textNe = "") => ({ text, textNe, citations });

describe("alert drafting", () => {
  it("requires a confirmed claim", () => {
    expect(alertReadiness({ claims: [makeClaim({ id: "c", reportId: "r" })] }).ready).toBe(false);
    expect(alertReadiness(baseInput()).ready).toBe(true);
  });

  it("only shows the model reviewed facts", async () => {
    const llm = new FakeLlm([{ headline: S("x", ["K1"]), known: [], whereWhen: [], impacts: [], unconfirmed: [] }]);
    await draftAlert(baseInput(), llm);
    const prompt = llm.promptText();
    expect(prompt).toContain("[K1] (impact_road) A landslide blocked the Araniko Highway near Larcha");
    expect(prompt).not.toContain("Three trucks");
    expect(prompt).toContain("[I1]");
    expect(prompt).not.toContain("Kodari");
    expect(prompt).toContain("[X1]");
    expect(prompt).not.toContain("clm_road");
  });

  it("keeps cited sentences and removes uncited, misplaced or unsupported ones", async () => {
    const llm = new FakeLlm([
      {
        headline: S("Possible landslide blocking the Araniko Highway near Larcha.", ["K1"], "लार्चा नजिक अरनिको राजमार्ग पहिरोले अवरुद्ध भएको हुन सक्छ।"),
        known: [
          S("A landslide blocked the highway near Larcha.", ["K1"]),
          S("Three trucks are stuck.", []),
          S("The road status is disputed.", ["X1"]),
        ],
        whereWhen: [S("Reported near Larcha.", ["K2"])],
        impacts: [
          S("Tatopani may lose road access to its nearest health facility, 23 km away by road.", ["I1"]),
          S("Tatopani may face a 40 km detour.", ["I1"]),
        ],
        unconfirmed: [S("Reports disagree on whether one lane is open.", ["X1"])],
      },
    ]);
    const out = await draftAlert(baseInput(), llm);
    const section = (k: string) => out.sections.find((s) => s.key === k)!;
    expect(section("headline").sentences[0].textNe).toContain("लार्चा");
    expect(section("known").sentences.map((s) => s.text)).toEqual(["A landslide blocked the highway near Larcha."]);
    expect(section("impacts").sentences).toHaveLength(1);
    expect(section("impacts").sentences[0].citations).toEqual([{ type: "impact", id: "imp_1" }]);
    expect(section("unconfirmed").sentences[0].citations).toEqual([{ type: "contradiction", id: "con_1" }]);
    expect(out.validation.removedSentences).toBe(3);
    expect(out.validation.warnings.join(" ")).toContain("numbers not found in its sources (40)");
    expect(out.sources).toEqual({ claimIds: ["clm_road", "clm_place"], impactCandidateIds: ["imp_1"], contradictionIds: ["con_1"] });
  });

  it("falls back to a system headline when the model's headline fails the checks", async () => {
    const llm = new FakeLlm([{ headline: S("Huge disaster!", []), known: [S("Road blocked.", ["K1"])], whereWhen: [], impacts: [], unconfirmed: [] }]);
    const out = await draftAlert(baseInput(["en"]), llm);
    expect(out.sections[0].sentences[0].text).toBe("Possible landslide near Larcha — reports under review.");
    expect(out.validation.warnings.join(" ")).toContain("written by the system");
    expect(out.sections.find((s) => s.key === "known")?.sentences[0].textNe).toBeUndefined();
  });
});
