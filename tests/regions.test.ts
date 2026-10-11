import { describe, expect, it } from "vitest";
import { getRegion, hazardLabel, hazardRelation, REGIONS } from "@/config/regions";

describe("regional configuration", () => {
  const nepal = getRegion("np");

  it("relates hazards that often occur together", () => {
    expect(hazardRelation(nepal, "landslide", "landslide")).toBe("same");
    expect(hazardRelation(nepal, "landslide", "debris_flow")).toBe("compatible");
    expect(hazardRelation(nepal, "flood", "fire")).toBe("different");
    expect(hazardRelation(nepal, "unclear", "flood")).toBe("unknown");
    expect(hazardRelation(nepal, undefined, "flood")).toBe("unknown");
  });

  it("falls back to Nepal and labels hazards", () => {
    expect(getRegion("zz").id).toBe("np");
    expect(hazardLabel(nepal, "glof")).toBe("Glacial lake outburst flood");
  });

  it("keeps the Philippines as configuration only, with no dataset", () => {
    const ph = getRegion("ph");
    expect(ph.status).toBe("configuration_only");
    expect(ph.datasetIds).toHaveLength(0);
  });

  it("gives every region 'other' and 'unclear' and a consistent compatibility list", () => {
    for (const region of REGIONS) {
      const ids = region.hazards.map((h) => h.id);
      expect(ids).toContain("other");
      expect(ids).toContain("unclear");
      for (const h of region.hazards) for (const c of h.compatibleWith) expect(ids).toContain(c);
    }
  });
});
