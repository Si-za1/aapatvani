import { describe, expect, it } from "vitest";
import { nepal } from "@/config/regions/nepal";
import { explainImpact } from "@/lib/ai/explain";
import type { ImpactCandidate } from "@/lib/domain/schemas";
import { FakeLlm } from "./helpers/fake-llm";

const candidate = (id: string, name: string, explanation: string, severity = 4): ImpactCandidate => ({
  id,
  key: `settlement:${id}`,
  kind: "settlement_access",
  finding: "lost_access",
  severity,
  name,
  lat: 27.9,
  lng: 85.9,
  metrics: {},
  explanation,
  caveats: [],
  reliesOnClaimIds: ["c1"],
  review: { status: "unreviewed" },
});

const assessment = {
  statusMessage: "Road access was analysed with one segment of Arniko Highway (NH34) treated as possibly blocked.",
  warnings: ["Places outside this analysis are not necessarily safe."],
  candidates: [
    candidate("imp_t", "Tatopani", "The nearest health facility for Tatopani is Keystone Hospital (23 km by road). No mapped road route remains."),
    candidate("imp_k", "Kodari", "The nearest health facility for Kodari is Keystone Hospital (26 km by road). No mapped road route remains."),
  ],
};

const reply = (summary: string, citations = ["I1"]) => new FakeLlm([{ summary, citations }]);

describe("impact explanation", () => {
  it("accepts a faithful summary and links its references", async () => {
    const out = await explainImpact(assessment, nepal, reply("Tatopani (I1) and Kodari (I2) may lose mapped road access to Keystone Hospital, 23 and 26 km away by road. These are possible impacts based on map data.", ["I1", "I2"]));
    expect(out.accepted).toBe(true);
    expect(out.text).toContain("[[imp_t]]");
    expect(out.citedCandidateIds).toEqual(["imp_t", "imp_k"]);
  });

  it.each([
    ["an invented number", "Tatopani (I1) may face a 40 km detour.", "numbers"],
    ["a safety claim", "Tatopani (I1) may lose access, but Barhabise is safe.", "safe"],
    ["casualty estimates", "Tatopani (I1) may lose access and people may be injured.", "casualties"],
    ["an invented reference", "Tatopani (I9) may lose access.", "do not exist"],
  ])("rejects a summary with %s", async (_label, summary, reason) => {
    const out = await explainImpact(assessment, nepal, reply(summary, summary.includes("I9") ? ["I9"] : ["I1"]));
    expect(out.accepted).toBe(false);
    expect(out.rejectionReason?.toLowerCase()).toContain(reason === "do not exist" ? "do not exist" : reason === "numbers" ? "numbers" : reason);
  });
});
