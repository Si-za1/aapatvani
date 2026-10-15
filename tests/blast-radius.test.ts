import { describe, expect, it } from "vitest";
import { analyzeBlastRadius, roadNamesMatch } from "@/lib/geo/blast-radius";
import { BLOCKAGE, TOY_ASSETS, TOY_INCIDENT, TOY_MANIFEST, toyGraph } from "./helpers/toy-dataset";

const NOT_SAFE = "Places outside this analysis are not necessarily safe.";

function run(options: { detour?: boolean; marketRoad?: boolean } = {}, overrides: Partial<Parameters<typeof analyzeBlastRadius>[0]> = {}) {
  return analyzeBlastRadius({
    graph: toyGraph(options),
    assets: TOY_ASSETS,
    manifest: TOY_MANIFEST,
    incident: TOY_INCIDENT,
    blockage: BLOCKAGE,
    ...overrides,
  });
}

describe("blast radius analysis", () => {
  it("flags lost access when the only road is blocked", () => {
    const res = run();
    expect(res.status).toBe("ok");
    expect(res.blockedEdges.map((b) => b.edge)).toEqual([1]);
    expect(res.candidates[0].kind).toBe("road_segment");
    expect(res.candidates[0].reliesOnClaimIds).toEqual(["claim_1"]);

    const upper = res.candidates.find((c) => c.key === "settlement:osm:node/2")!;
    expect(upper.finding).toBe("lost_access");
    expect(upper.access?.[0].status).toBe("lost");
    expect(upper.access?.[0].beforeFacilityName).toBe("Test Hospital");
    expect(upper.explanation).toContain("no mapped road route to any health facility remains");
    expect(upper.caveats.join(" ")).toContain("not confirmed");
    expect(upper.geometry?.length).toBeGreaterThanOrEqual(4);

    expect(res.candidates.some((c) => c.key === "settlement:osm:node/4")).toBe(false);
    const facility = res.candidates.find((c) => c.kind === "facility_access")!;
    expect(facility.name).toBe("Test Hospital");
    expect(facility.affectedSettlements).toEqual(["Upper Village"]);
    expect(res.stats.lostAccessAny).toBe(1);
    expect(res.warnings).toContain(NOT_SAFE);
  });

  it("flags a longer route when a detour exists", () => {
    const res = run({ detour: true });
    const upper = res.candidates.find((c) => c.key === "settlement:osm:node/2")!;
    expect(upper.finding).toBe("longer_route");
    const any = upper.access![0];
    expect(any.status).toBe("longer");
    expect(any.afterM! - any.beforeM!).toBeGreaterThan(5000);
    expect(upper.explanation).toContain("longer");
    expect(res.stats.longerRouteAny).toBe(1);
  });

  it("lists nearby assets by straight-line distance and says that is not impact", () => {
    const res = run();
    const school = res.candidates.find((c) => c.key === "nearby:osm:node/3")!;
    expect(school.finding).toBe("nearby");
    expect(school.explanation).toContain("does not mean it is affected");
    // The hospital already appears as a facility candidate, so it is not repeated as "nearby".
    expect(res.candidates.filter((c) => c.assetId === "osm:node/1")).toHaveLength(1);
  });

  it("only lists nearby assets when no claim describes a blockage", () => {
    const res = run({}, { blockage: null });
    expect(res.status).toBe("proximity_only");
    expect(res.candidates.every((c) => c.kind === "nearby_asset")).toBe(true);
    expect(res.statusMessage).toContain("not analysed");
    expect(res.warnings).toContain(NOT_SAFE);
  });

  it("refuses to analyse outside the dataset", () => {
    const res = run({}, { incident: { lat: 28.5, lng: 86.5, uncertaintyM: 50 } });
    expect(res.status).toBe("outside_dataset");
    expect(res.candidates).toHaveLength(0);
    expect(res.statusMessage).toContain("does not mean the area is unaffected");
  });

  it("reports when no mapped road is near a reported blockage", () => {
    const res = run({}, { incident: { lat: 27.05, lng: 85.05, uncertaintyM: 100 } });
    expect(res.status).toBe("no_road_nearby");
    expect(res.blockedEdges).toHaveLength(0);
  });

  it("prefers the road named in the report over a closer road", () => {
    // ~90 m north of Test Highway, right on Market Road: both are trunk roads inside the search radius.
    const incident = { lat: 27.0008, lng: 85.0151, uncertaintyM: 100 };
    const unnamed = run({ marketRoad: true }, { incident });
    expect(unnamed.blockedEdges[0].name).toBe("Market Road");
    const named = run({ marketRoad: true }, { incident, blockage: { ...BLOCKAGE, roadNames: ["test highway"] } });
    expect(named.blockedEdges[0].name).toBe("Test Highway");
    expect(named.otherNearbyRoads.map((r) => r.name)).toContain("Market Road");
  });

  it("is deterministic", () => {
    expect(run({ detour: true })).toEqual(run({ detour: true }));
  });
});

describe("road name matching", () => {
  it("matches spelling variants of the same road", () => {
    expect(roadNamesMatch("Araniko Rajmarg", "Arniko Highway (NH34)")).toBe(true);
    expect(roadNamesMatch("Arniko highway", "Araniko Highway")).toBe(true);
    expect(roadNamesMatch("NH34", "Arniko Highway (NH34)")).toBe(true);
  });

  it("does not match different roads", () => {
    expect(roadNamesMatch("Prithvi Highway", "Arniko Highway (NH34)")).toBe(false);
    expect(roadNamesMatch("", "Arniko Highway")).toBe(false);
  });

  it("does not fuzzy-match route designations, which are exact identifiers", () => {
    // Regression. "23dr033" and "23dr032" are two different roads one character apart, and the old
    // rule treated them as the same road — across the shipped extract 1,040 of 3,003 distinct
    // road-name pairs matched each other this way.
    expect(roadNamesMatch("23DR033", "23DR032")).toBe(false);
    expect(roadNamesMatch("23DR011", "23DR012")).toBe(false);
    expect(roadNamesMatch("23dr024", "23dr035")).toBe(false);
  });

  it("still tolerates a misspelling of an actual word", () => {
    expect(roadNamesMatch("Bahrabise Road", "Bahrabis Road")).toBe(true);
    expect(roadNamesMatch("Araniko", "Arniko")).toBe(true);
    expect(roadNamesMatch("Araniko Rajmarg", "Arniko Highway (NH34)")).toBe(true);
  });

  it("matches two roads that genuinely share a name word", () => {
    // Deliberate, and worth stating because it looks like the bug above and is not. "Budepa - Latu"
    // and "Bahrabise - Budepa - Ghorthali" are both real roads through Budepa, and a reporter naming
    // one may mean either. The name rule is allowed to be generous here. What stops the wrong one
    // being blocked is the rule applied after it: among candidates that match the name, the NEAREST
    // wins. This test asserts the name rule; the choice rule is asserted by the analysis tests above,
    // which is why tightening the name rule alone was not the fix.
    expect(roadNamesMatch("Budepa - Latu Road (23DR033)", "Bahrabise - Budepa - Ghorthali Road (23DR032)")).toBe(true);
  });
});
