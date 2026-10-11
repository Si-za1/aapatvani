import { describe, expect, it } from "vitest";
import { AliasRegistry, checkCitations } from "@/lib/evidence/aliases";

describe("alias registry", () => {
  it("issues sequential aliases per prefix and resolves them case-insensitively", () => {
    const reg = new AliasRegistry<string>();
    expect(reg.register("R", "rep_1")).toBe("R1");
    expect(reg.register("M", "med_a")).toBe("M1");
    expect(reg.register("M", "med_b")).toBe("M2");
    expect(reg.resolve("m2")).toBe("med_b");
    expect(reg.resolve(" R1 ")).toBe("rep_1");
    expect(reg.resolve("R2")).toBeUndefined();
  });

  it("separates valid citations from invented ones and drops duplicates", () => {
    const reg = new AliasRegistry<string>();
    reg.register("C", "claim_a");
    reg.register("C", "claim_b");
    const check = checkCitations(reg, ["C1", "c1", "C9", "rep_123", "C2"]);
    expect(check.valid).toEqual(["claim_a", "claim_b"]);
    expect(check.rejected).toEqual(["C9", "REP_123"]);
  });
});
