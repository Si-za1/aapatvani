import { describe, expect, it } from "vitest";
import { canonicalText, locateExcerpt, segmentText } from "@/lib/evidence/excerpt";

const EN = "The road near Larcha is completely blocked by a landslide. Two trucks are stuck.";
const NE = "लार्चा नजिक अरनिको राजमार्गमा ठूलो पहिरो खसेको छ। बाटो पूरै बन्द छ।";

describe("excerpt verification", () => {
  it("finds an exact English excerpt and returns its position", () => {
    const loc = locateExcerpt(EN, "completely blocked by a landslide");
    expect(loc.verified).toBe(true);
    expect(EN.slice(loc.start, loc.end)).toBe("completely blocked by a landslide");
  });

  it("tolerates case and whitespace differences only", () => {
    const loc = locateExcerpt(EN, "ROAD  near   larcha");
    expect(loc.verified).toBe(true);
    expect(EN.slice(loc.start, loc.end)).toBe("road near Larcha");
  });

  it("finds Nepali excerpts, with or without the full stop (danda)", () => {
    const loc = locateExcerpt(NE, "बाटो पूरै बन्द छ");
    expect(loc.verified).toBe(true);
    expect(canonicalText(NE).slice(loc.start, loc.end)).toBe("बाटो पूरै बन्द छ");
    expect(locateExcerpt(NE, "बाटो पूरै बन्द छ।").verified).toBe(true);
  });

  it("treats Devanagari and ASCII digits as the same", () => {
    expect(locateExcerpt("३ जना बेपत्ता छन्", "3 जना बेपत्ता").verified).toBe(true);
  });

  it("treats curly and straight quotes as the same", () => {
    expect(locateExcerpt("He said “road closed” this morning", '"road closed"').verified).toBe(true);
  });

  it("rejects text that is not in the report", () => {
    expect(locateExcerpt(EN, "three people died").verified).toBe(false);
    expect(locateExcerpt(NE, "पुल भत्कियो").verified).toBe(false);
  });

  it("rejects excerpts too short to mean anything", () => {
    expect(locateExcerpt(NE, "छ").verified).toBe(false);
    expect(locateExcerpt(EN, "  .  ").verified).toBe(false);
  });

  it("rejects a fragment too short or too generic to be evidence", () => {
    // Regression. The floor was three characters with no word requirement, so "the" verified against
    // a 600,000-character report and "road" verified inside the word "Broadway". A claim citing
    // either earned the same "Reported · verified" label as one quoting a whole sentence — the exact
    // label this product asks a reviewer to trust.
    const report = "The bridge was not damaged. The road is closed.";
    expect(locateExcerpt(report, "the").verified).toBe(false);
    expect(locateExcerpt(report, "not").verified).toBe(false);
    expect(locateExcerpt("Broadway Avenue is under water", "road").verified).toBe(false);
  });

  it("does not let a quotation be assembled across a sentence boundary", () => {
    // Regression, and the dangerous one. The punctuation pass deleted full stops along with commas,
    // so the model could join the tail of one sentence to the head of the next and produce a quote
    // that says the opposite of the report: "damaged the road is closed", highlighted from just
    // AFTER the word "not".
    const report = "The bridge was not damaged. The road is closed.";
    expect(locateExcerpt(report, "damaged the road is closed").verified).toBe(false);
    // Both halves, quoted honestly, still verify.
    expect(locateExcerpt(report, "The bridge was not damaged").verified).toBe(true);
    expect(locateExcerpt(report, "The road is closed").verified).toBe(true);
  });

  it("still accepts a genuine short quotation", () => {
    // The floor has to stay low enough for real phrasing, or the fix trades a false positive for a
    // false negative — and a claim downgraded for a quote the reporter did write is its own kind of
    // dishonesty.
    expect(locateExcerpt("बाटो पूरै बन्द छ, सवारी अड्किएका छन्।", "बाटो पूरै बन्द छ").verified).toBe(true);
    expect(locateExcerpt("the road is closed today", "road is closed").verified).toBe(true);
  });

  it("splits text into highlighted and plain segments that rebuild the original", () => {
    const loc = locateExcerpt(EN, "Two trucks are stuck");
    const segments = segmentText(EN, [{ start: loc.start!, end: loc.end!, id: "c1" }]);
    expect(segments.map((s) => s.text).join("")).toBe(EN);
    expect(segments.find((s) => s.ids.includes("c1"))?.text).toBe("Two trucks are stuck");
  });
});
