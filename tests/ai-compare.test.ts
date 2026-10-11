import { describe, expect, it } from "vitest";
import { nepal } from "@/config/regions/nepal";
import { compareReports, type CompareFeatures } from "@/lib/ai/compare";
import { FakeLlm } from "./helpers/fake-llm";
import { makeClaim, makeReport } from "./helpers/fixtures";

const reportA = makeReport({ id: "rep_A" });
const reportB = makeReport({ id: "rep_B", uiLanguage: "en", text: "Road to Tatopani blocked near Larcha by a landslide this morning." });
const a = {
  report: reportA,
  claims: [
    makeClaim({ id: "clm_a1", reportId: "rep_A", statementEn: "A big landslide fell near Larcha" }),
    makeClaim({ id: "clm_a2", reportId: "rep_A", type: "impact_road", statementEn: "The road is completely blocked", roadStatus: "blocked" }),
    makeClaim({ id: "clm_a3", reportId: "rep_A", statementEn: "Rejected claim", review: { status: "rejected" } }),
  ],
};
const b = {
  report: reportB,
  claims: [
    makeClaim({ id: "clm_b1", reportId: "rep_B", statementEn: "Landslide near Larcha" }),
    makeClaim({ id: "clm_b2", reportId: "rep_B", type: "impact_road", statementEn: "One lane is open", roadStatus: "partially_blocked" }),
  ],
};
const features: CompareFeatures = { distanceKm: 1.2, hoursApart: 0.5, hazardMatch: "same", sharedMedia: false, sameReporter: false };

describe("report comparison", () => {
  it("maps cited aliases to claims and drops unsupported items", async () => {
    const llm = new FakeLlm([
      {
        verdict: "likely_same",
        rationale: "A1 and B1 both describe a landslide near Larcha; A2 and B2 disagree on the road. C9 is unrelated.",
        agreements: [
          { text: "Both mention a landslide near Larcha (A1, B1).", claims: ["A1", "B1"] },
          { text: "Invented", claims: ["C9"] },
        ],
        conflicts: [
          { kind: "road_status", text: "A2 says fully blocked, B2 says one lane open.", claims: ["A2", "B2"] },
          { kind: "description", text: "Only one side cited", claims: ["A1"] },
        ],
        missing: ["Exact location of the blockage"],
        copySignals: [],
      },
    ]);
    const out = await compareReports(a, b, features, nepal, llm);
    expect(out.verdict).toBe("likely_same");
    expect(out.agreements).toEqual([{ text: "Both mention a landslide near Larcha ([[clm_a1]], [[clm_b1]]).", claimIds: ["clm_a1", "clm_b1"] }]);
    expect(out.conflicts).toEqual([{ text: "[[clm_a2]] says fully blocked, [[clm_b2]] says one lane open.", claimIds: ["clm_a2", "clm_b2"], kind: "road_status" }]);
    expect(out.rationale).toContain("[[clm_a1]] and [[clm_b1]]");
    // "C9" is not an alias in this prompt's scheme, so it is never turned into a reference.
    expect(out.rationale).not.toContain("[[C9]]");
    expect(out.droppedItems).toBe(2);
    expect(out.citationsRejected).toBe(1);
  });

  it("shows the model computed features but no record ids, and skips rejected claims", async () => {
    const llm = new FakeLlm([{ verdict: "possibly_same", rationale: "", agreements: [], conflicts: [], missing: [], copySignals: [] }]);
    await compareReports(a, b, features, nepal, llm);
    const prompt = llm.promptText();
    expect(prompt).toContain("1.2 km");
    expect(prompt).toContain("[A2] (impact_road; reported)");
    expect(prompt).not.toContain("Rejected claim");
    expect(prompt).not.toContain("clm_a1");
    expect(prompt).not.toContain("rep_A");
    expect(llm.calls[0].thinking).toBe("medium");
  });
});
