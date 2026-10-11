// Checks on the shipped OpenStreetMap extract, plus a regression test for the demo scenario.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AssetsFile, DatasetManifest, GazetteerFile, RoadNetworkFile } from "@/lib/geo/dataset-types";
import { analyzeBlastRadius } from "@/lib/geo/blast-radius";
import { RoadGraph } from "@/lib/geo/graph";
import { bboxContains } from "@/lib/geo/math";

const dir = path.join(process.cwd(), "data/regions/nepal/araniko-corridor");
const read = <T,>(f: string) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as T;
const manifest = read<DatasetManifest>("dataset.json");
const network = read<RoadNetworkFile>("network.json");
const { assets } = read<AssetsFile>("assets.json");
const { entries } = read<GazetteerFile>("gazetteer.json");
const graph = new RoadGraph(network);

describe("Araniko corridor dataset", () => {
  it("matches its manifest", () => {
    expect(graph.nodeCount).toBe(manifest.stats.nodes);
    expect(graph.edgeCount).toBe(manifest.stats.edges);
    expect(assets.filter((a) => a.kind === "health_facility")).toHaveLength(manifest.stats.healthFacilities);
    expect(entries).toHaveLength(manifest.stats.gazetteerEntries);
    expect(manifest.license).toBe("ODbL-1.0");
  });

  it("has a well-formed graph", () => {
    for (let e = 0; e < graph.edgeCount; e++) {
      expect(graph.edgeFrom[e]).toBeLessThan(graph.nodeCount);
      expect(graph.edgeTo[e]).toBeLessThan(graph.nodeCount);
      expect(graph.edgeLength[e]).toBeGreaterThanOrEqual(0);
      expect(graph.geomOffset[e] + graph.geomCount[e]).toBeLessThanOrEqual(graph.geometry.length / 2);
    }
  });

  it("keeps every asset inside the bbox and snapped to a real node", () => {
    for (const a of assets) {
      expect(bboxContains(manifest.bbox, a.lat, a.lng)).toBe(true);
      expect(a.node).toBeLessThan(graph.nodeCount);
      if (a.node >= 0) expect(a.snapM).toBeGreaterThanOrEqual(0);
    }
  });

  it("has Nepali names for most places", () => {
    const places = entries.filter((e) => ["town", "village", "hamlet", "suburb"].includes(e.kind));
    const withNepali = places.filter((e) => e.nameNe);
    expect(withNepali.length / places.length).toBeGreaterThan(0.8);
  });

  it("demo scenario: a blockage between Larcha and Tatopani cuts mapped road access for Tatopani and Kodari", () => {
    const res = analyzeBlastRadius({
      graph,
      assets,
      manifest,
      incident: { lat: 27.9385, lng: 85.9418, uncertaintyM: 150 },
      blockage: { claimIds: ["c1"], claimStatus: { c1: "confirmed" }, roadNames: ["Araniko Rajmarg"] },
    });
    expect(res.status).toBe("ok");
    expect(res.blockedEdges[0].name).toContain("Arniko Highway");
    const lost = res.candidates.filter((c) => c.finding === "lost_access").map((c) => c.name);
    expect(lost).toEqual(expect.arrayContaining(["Tatopani", "Kodāri"]));
    expect(res.candidates.find((c) => c.name === "Tatopani")?.access?.[0].beforeFacilityName).toBe(
      "Keystone Hospital & Research Centre",
    );
  });
});
