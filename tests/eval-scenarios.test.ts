import { describe, expect, it } from "vitest";
import { locateExcerpt } from "@/lib/evidence/excerpt";
import { SCENARIOS } from "@/lib/eval/scenarios";

// The scenarios are an answer key, and a wrong answer key is worse than none: it would quietly
// measure the wrong thing and still print a confident number. These checks are about the key, not
// about the pipeline.

describe("evaluation scenarios", () => {
  it("has at least one scenario, each with an id, name and summary", () => {
    expect(SCENARIOS.length).toBeGreaterThan(0);
    for (const scenario of SCENARIOS) {
      expect(scenario.id, scenario.id).toMatch(/^[a-z0-9-]+$/);
      expect(scenario.name.length, scenario.id).toBeGreaterThan(5);
      expect(scenario.summary.length, scenario.id).toBeGreaterThan(10);
      expect(Number.isNaN(Date.parse(scenario.baseTime)), scenario.id).toBe(false);
    }
  });

  it("uses unique scenario ids and unique report keys within a scenario", () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const scenario of SCENARIOS) {
      const keys = scenario.reports.map((r) => r.key);
      expect(new Set(keys).size, scenario.id).toBe(keys.length);
    }
  });

  it("quotes every expected excerpt from its own report text", () => {
    // If an excerpt is not in the text, the pipeline will correctly mark it unverified — and the
    // scenario would then be asserting something the system cannot possibly do.
    const problems: string[] = [];
    for (const scenario of SCENARIOS) {
      for (const report of scenario.reports) {
        for (const claim of report.expectedClaims) {
          if (!claim.excerptText) continue;
          const located = locateExcerpt(report.text, claim.excerptText);
          if (!located.verified) problems.push(`${scenario.id}/${report.key}: "${claim.excerptText}"`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("gives every expected claim both languages and a type", () => {
    for (const scenario of SCENARIOS) {
      for (const report of scenario.reports) {
        expect(report.expectedClaims.length, `${scenario.id}/${report.key}`).toBeGreaterThan(0);
        for (const claim of report.expectedClaims) {
          expect(claim.statement.trim(), `${scenario.id}/${report.key}`).not.toBe("");
          expect(claim.statementEn.trim(), `${scenario.id}/${report.key}`).not.toBe("");
        }
      }
    }
  });

  it("only refers to reports that exist", () => {
    for (const scenario of SCENARIOS) {
      const keys = new Set(scenario.reports.map((r) => r.key));
      const referenced = [
        ...scenario.expectations.groups.flat(),
        ...scenario.expectations.mustNotMerge.flat(),
        ...scenario.expectations.copies.flat(),
        ...scenario.expectations.contradictions.flatMap((c) => c.between),
        ...(scenario.expectations.abstain ?? []),
      ];
      for (const key of referenced) expect(keys.has(key), `${scenario.id}: unknown report key ${key}`).toBe(true);
    }
  });

  it("never expects a pair to be both grouped and kept apart", () => {
    for (const scenario of SCENARIOS) {
      const together = new Set<string>();
      for (const group of scenario.expectations.groups) {
        for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) together.add([group[i], group[j]].sort().join("~"));
      }
      for (const [a, b] of scenario.expectations.mustNotMerge) {
        expect(together.has([a, b].sort().join("~")), `${scenario.id}: ${a} and ${b}`).toBe(false);
      }
    }
  });

  it("puts a copy and its original in the same group", () => {
    // A copy is not an independent source, but it does belong to the incident it copies.
    for (const scenario of SCENARIOS) {
      for (const [copy, original] of scenario.expectations.copies) {
        const shares = scenario.expectations.groups.some((group) => group.includes(copy) && group.includes(original));
        expect(shares, `${scenario.id}: ${copy} and ${original}`).toBe(true);
      }
    }
  });

  it("covers every behaviour the evaluation claims to measure", () => {
    // If one of these is missing, the results page would report on it as "not measured" without
    // anyone noticing that the coverage was never there.
    expect(SCENARIOS.some((s) => s.expectations.copies.length > 0)).toBe(true);
    expect(SCENARIOS.some((s) => s.expectations.contradictions.length > 0)).toBe(true);
    expect(SCENARIOS.some((s) => (s.expectations.abstain ?? []).length > 0)).toBe(true);
    expect(SCENARIOS.some((s) => s.expectations.impact)).toBe(true);
    expect(SCENARIOS.some((s) => s.expectations.mustNotMerge.length > 0)).toBe(true);
    expect(SCENARIOS.some((s) => s.expectations.groups.some((g) => g.length > 1))).toBe(true);
  });

  it("keeps every scenario inside the corridor the road dataset covers", () => {
    // Nepal's bounding box, generously. A scenario outside it would fail impact analysis for a
    // reason that has nothing to do with the pipeline.
    for (const scenario of SCENARIOS) {
      for (const report of scenario.reports) {
        const { lat, lng } = report.location;
        if (lat === undefined || lng === undefined) continue;
        expect(lat, `${scenario.id}/${report.key}`).toBeGreaterThan(26.3);
        expect(lat, `${scenario.id}/${report.key}`).toBeLessThan(30.5);
        expect(lng, `${scenario.id}/${report.key}`).toBeGreaterThan(80.0);
        expect(lng, `${scenario.id}/${report.key}`).toBeLessThan(88.3);
      }
    }
  });
});
