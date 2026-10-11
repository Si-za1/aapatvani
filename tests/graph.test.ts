import { describe, expect, it } from "vitest";
import { pathToSource, roadClassRank, shortestPaths } from "@/lib/geo/graph";
import { toyGraph } from "./helpers/toy-dataset";

describe("road graph", () => {
  it("builds undirected adjacency", () => {
    const g = toyGraph({ detour: true });
    expect(g.nodeCount).toBe(5);
    expect(g.edgeCount).toBe(5);
    const neighbours = (n: number) =>
      Array.from(g.adjEdge.subarray(g.adjStart[n], g.adjStart[n + 1])).map((e) => g.other(e, n)).sort();
    expect(neighbours(1)).toEqual([0, 2, 4]);
    expect(neighbours(4)).toEqual([1, 2]);
  });

  it("labels named and unnamed roads", () => {
    const g = toyGraph({ detour: true });
    expect(g.edgeLabel(0)).toBe("Test Highway");
    expect(g.edgeLabel(3)).toBe("Unnamed track road");
  });

  it("finds shortest distances from the nearest source", () => {
    const g = toyGraph({ detour: true });
    const paths = shortestPaths(g, [0]);
    const straight = g.edgeLength[0] + g.edgeLength[1] + g.edgeLength[2];
    expect(paths.dist[3]).toBeCloseTo(straight, 6);
    expect(paths.nearestSource[3]).toBe(0);
    expect(pathToSource(g, paths, 3)).toEqual([2, 1, 0]);
  });

  it("re-routes around a blocked edge, or reports no route", () => {
    const withDetour = toyGraph({ detour: true });
    const rerouted = shortestPaths(withDetour, [0], new Set([1]));
    const expected = withDetour.edgeLength[0] + withDetour.edgeLength[3] + withDetour.edgeLength[4] + withDetour.edgeLength[2];
    expect(rerouted.dist[3]).toBeCloseTo(expected, 6);

    const noDetour = toyGraph();
    const cut = shortestPaths(noDetour, [0], new Set([1]));
    expect(cut.dist[3]).toBe(Infinity);
    expect(cut.nearestSource[3]).toBe(-1);
  });

  it("finds edges near a point, nearest first", () => {
    const g = toyGraph({ detour: true });
    const hits = g.edgesNear(27.0, 85.015, 150);
    expect(hits.map((h) => h.edge)).toEqual([1]);
    expect(hits[0].distanceM).toBeLessThan(1);
  });

  it("ranks road classes by importance", () => {
    expect(roadClassRank("trunk")).toBeLessThan(roadClassRank("track"));
    expect(roadClassRank("primary_link")).toBe(roadClassRank("primary"));
  });
});
