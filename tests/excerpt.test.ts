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

  it("splits text into highlighted and plain segments that rebuild the original", () => {
    const loc = locateExcerpt(EN, "Two trucks are stuck");
    const segments = segmentText(EN, [{ start: loc.start!, end: loc.end!, id: "c1" }]);
    expect(segments.map((s) => s.text).join("")).toBe(EN);
    expect(segments.find((s) => s.ids.includes("c1"))?.text).toBe("Two trucks are stuck");
  });
});
