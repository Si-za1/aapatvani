// A tiny hand-built road network with known answers, used to test the routing and impact logic.
//
//   Test Hospital (n0) ── e0 ── n1 ── e1 ── n2 ── e2 ── Upper Village (n3)      all "Test Highway" (trunk)
//                                 \                /
//                                  e3 ── n4 ── e4                              optional detour (tracks)
//
// Lower Village sits at the hospital. A school sits just off n2.

import type { Asset, DatasetManifest, RoadNetworkFile } from "@/lib/geo/dataset-types";
import { RoadGraph } from "@/lib/geo/graph";
import { haversineM } from "@/lib/geo/math";

const NODES: Array<[number, number]> = [
  [27.0, 85.0],
  [27.0, 85.01],
  [27.0, 85.02],
  [27.0, 85.03],
  [27.03, 85.015],
];

type EdgeSpec = { from: number; to: number; cls: string; name?: string; points?: Array<[number, number]> };

export function toyNetwork(options: { detour?: boolean; marketRoad?: boolean } = {}): RoadNetworkFile {
  const specs: EdgeSpec[] = [
    { from: 0, to: 1, cls: "trunk", name: "Test Highway" },
    { from: 1, to: 2, cls: "trunk", name: "Test Highway" },
    { from: 2, to: 3, cls: "trunk", name: "Test Highway" },
  ];
  if (options.detour) {
    specs.push({ from: 1, to: 4, cls: "track" }, { from: 4, to: 2, cls: "track" });
  }
  const nodes = NODES.flat();
  if (options.marketRoad) {
    // A short trunk road crossing ~10 m from the incident point (27.0, 85.015), between two new nodes.
    nodes.push(26.999, 85.0151, 27.001, 85.0151);
    specs.push({ from: 5, to: 6, cls: "trunk", name: "Market Road" });
  }
  const classes: string[] = [];
  const names: string[] = [];
  const geometry: number[] = [];
  const edges = specs.map((s, i) => {
    const a: [number, number] = [nodes[s.from * 2], nodes[s.from * 2 + 1]];
    const b: [number, number] = [nodes[s.to * 2], nodes[s.to * 2 + 1]];
    const points = s.points ?? [a, b];
    const offset = geometry.length / 2;
    let length = 0;
    points.forEach((p, k) => {
      geometry.push(p[0], p[1]);
      if (k > 0) length += haversineM(points[k - 1][0], points[k - 1][1], p[0], p[1]);
    });
    if (!classes.includes(s.cls)) classes.push(s.cls);
    if (s.name && !names.includes(s.name)) names.push(s.name);
    return [s.from, s.to, Math.round(length), classes.indexOf(s.cls), s.name ? names.indexOf(s.name) : -1, 1000 + i, offset, points.length];
  });
  return { datasetId: "toy", nodes, edges, geometry, classes, names };
}

export const TOY_ASSETS: Asset[] = [
  { id: "osm:node/1", kind: "health_facility", subtype: "hospital", name: "Test Hospital", lat: 27.0, lng: 85.0, node: 0, snapM: 0, osm: "node/1" },
  { id: "osm:node/2", kind: "settlement", subtype: "village", name: "Upper Village", nameNe: "माथिल्लो गाउँ", lat: 27.0, lng: 85.03, node: 3, snapM: 0, osm: "node/2" },
  { id: "osm:node/3", kind: "school", subtype: "school", name: "Test School", lat: 27.001, lng: 85.02, node: 2, snapM: 111, osm: "node/3" },
  { id: "osm:node/4", kind: "settlement", subtype: "village", name: "Lower Village", lat: 27.0, lng: 85.0, node: 0, snapM: 0, osm: "node/4" },
];

export const TOY_MANIFEST: DatasetManifest = {
  id: "toy",
  regionId: "np",
  name: "Toy dataset",
  bbox: [26.9, 84.9, 27.1, 85.1],
  snapshot: "2026-01-01T00:00:00Z",
  preparedAt: "2026-01-01T00:00:00Z",
  source: "Hand-built test fixture",
  license: "n/a",
  attribution: "n/a",
  query: "n/a",
  includedRoadClasses: ["trunk", "track"],
  stats: {
    nodes: 5, edges: 5, roadKm: 9, components: 1, largestComponentShare: 1, healthFacilities: 1, hospitals: 1,
    schools: 1, settlements: 2, gazetteerEntries: 0, excludedCrossBorder: 0,
  },
  knownLimitations: [],
};

export function toyGraph(options?: { detour?: boolean; marketRoad?: boolean }) {
  return new RoadGraph(toyNetwork(options));
}

/** Incident on the middle segment (e1), at its midpoint. */
export const TOY_INCIDENT = { lat: 27.0, lng: 85.015, uncertaintyM: 100 };

export const BLOCKAGE = {
  claimIds: ["claim_1"],
  claimStatus: { claim_1: "unreviewed" },
  roadNames: [] as string[],
};
