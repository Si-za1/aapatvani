// Road graph and shortest-path search. Pure and deterministic.

import type { RoadNetworkFile } from "./dataset-types";
import { pointToPolyline } from "./math";

const CLASS_RANK: Record<string, number> = {
  motorway: 0,
  trunk: 1,
  primary: 2,
  secondary: 3,
  tertiary: 4,
  unclassified: 5,
  residential: 6,
  road: 6,
  living_street: 7,
  track: 8,
  service: 9,
};

export function roadClassRank(cls: string): number {
  return CLASS_RANK[cls.replace(/_link$/, "")] ?? 10;
}

export type EdgeHit = { edge: number; distanceM: number; lat: number; lng: number };

export class RoadGraph {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly nodeLat: Float64Array;
  readonly nodeLng: Float64Array;
  readonly edgeFrom: Int32Array;
  readonly edgeTo: Int32Array;
  readonly edgeLength: Float64Array;
  readonly edgeClass: Int16Array;
  readonly edgeNameIndex: Int32Array;
  readonly edgeWayId: Float64Array;
  readonly geomOffset: Int32Array;
  readonly geomCount: Int32Array;
  readonly geometry: Float64Array;
  readonly classes: string[];
  readonly names: string[];
  /** CSR adjacency: neighbours of node n are adjEdge[adjStart[n] .. adjStart[n + 1]). */
  readonly adjStart: Int32Array;
  readonly adjEdge: Int32Array;
  private readonly edgeBox: Float64Array;

  constructor(file: RoadNetworkFile) {
    this.nodeCount = file.nodes.length / 2;
    this.edgeCount = file.edges.length;
    this.classes = file.classes;
    this.names = file.names;
    this.nodeLat = new Float64Array(this.nodeCount);
    this.nodeLng = new Float64Array(this.nodeCount);
    for (let i = 0; i < this.nodeCount; i++) {
      this.nodeLat[i] = file.nodes[i * 2];
      this.nodeLng[i] = file.nodes[i * 2 + 1];
    }
    this.edgeFrom = new Int32Array(this.edgeCount);
    this.edgeTo = new Int32Array(this.edgeCount);
    this.edgeLength = new Float64Array(this.edgeCount);
    this.edgeClass = new Int16Array(this.edgeCount);
    this.edgeNameIndex = new Int32Array(this.edgeCount);
    this.edgeWayId = new Float64Array(this.edgeCount);
    this.geomOffset = new Int32Array(this.edgeCount);
    this.geomCount = new Int32Array(this.edgeCount);
    this.geometry = Float64Array.from(file.geometry);
    this.edgeBox = new Float64Array(this.edgeCount * 4);
    const degree = new Int32Array(this.nodeCount);
    file.edges.forEach(([from, to, len, cls, name, way, off, count], i) => {
      this.edgeFrom[i] = from;
      this.edgeTo[i] = to;
      this.edgeLength[i] = len;
      this.edgeClass[i] = cls;
      this.edgeNameIndex[i] = name;
      this.edgeWayId[i] = way;
      this.geomOffset[i] = off;
      this.geomCount[i] = count;
      degree[from]++;
      degree[to]++;
      let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
      for (let k = 0; k < count; k++) {
        const lat = file.geometry[(off + k) * 2];
        const lng = file.geometry[(off + k) * 2 + 1];
        s = Math.min(s, lat); n = Math.max(n, lat);
        w = Math.min(w, lng); e = Math.max(e, lng);
      }
      this.edgeBox.set([s, w, n, e], i * 4);
    });
    this.adjStart = new Int32Array(this.nodeCount + 1);
    for (let i = 0; i < this.nodeCount; i++) this.adjStart[i + 1] = this.adjStart[i] + degree[i];
    this.adjEdge = new Int32Array(this.adjStart[this.nodeCount]);
    const fill = this.adjStart.slice(0, this.nodeCount);
    for (let i = 0; i < this.edgeCount; i++) {
      this.adjEdge[fill[this.edgeFrom[i]]++] = i;
      this.adjEdge[fill[this.edgeTo[i]]++] = i;
    }
  }

  other(edge: number, node: number): number {
    return this.edgeFrom[edge] === node ? this.edgeTo[edge] : this.edgeFrom[edge];
  }

  edgeName(edge: number): string | undefined {
    const i = this.edgeNameIndex[edge];
    return i >= 0 ? this.names[i] : undefined;
  }

  edgeClassName(edge: number): string {
    return this.classes[this.edgeClass[edge]] ?? "road";
  }

  edgeLabel(edge: number): string {
    return this.edgeName(edge) ?? `Unnamed ${this.edgeClassName(edge).replace(/_/g, " ")} road`;
  }

  /** Flat [lat, lng, ...] polyline for one edge. */
  edgeCoords(edge: number): number[] {
    const off = this.geomOffset[edge];
    return Array.from(this.geometry.subarray(off * 2, (off + this.geomCount[edge]) * 2));
  }

  /** All edges whose geometry passes within radiusM of the point, nearest first. */
  edgesNear(lat: number, lng: number, radiusM: number): EdgeHit[] {
    const dLat = radiusM / 111_320;
    const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
    const hits: EdgeHit[] = [];
    for (let i = 0; i < this.edgeCount; i++) {
      const b = i * 4;
      if (
        this.edgeBox[b] > lat + dLat ||
        this.edgeBox[b + 2] < lat - dLat ||
        this.edgeBox[b + 1] > lng + dLng ||
        this.edgeBox[b + 3] < lng - dLng
      )
        continue;
      const hit = pointToPolyline(lat, lng, this.geometry, this.geomOffset[i], this.geomCount[i]);
      if (hit.distanceM <= radiusM) hits.push({ edge: i, distanceM: hit.distanceM, lat: hit.lat, lng: hit.lng });
    }
    return hits.sort((a, b) => a.distanceM - b.distanceM || a.edge - b.edge);
  }

  /** Concatenated geometry for a path of edges, as a flat [lat, lng, ...] array. */
  pathCoords(edges: number[]): number[] {
    const out: number[] = [];
    for (const e of edges) {
      const c = this.edgeCoords(e);
      if (out.length >= 2 && out[out.length - 2] === c[0] && out[out.length - 1] === c[1]) out.push(...c.slice(2));
      else if (out.length >= 2 && out[out.length - 2] === c[c.length - 2] && out[out.length - 1] === c[c.length - 1]) {
        const rev: number[] = [];
        for (let k = c.length - 2; k >= 0; k -= 2) rev.push(c[k], c[k + 1]);
        out.push(...rev.slice(2));
      } else out.push(...c);
    }
    return out;
  }
}

/** Binary min-heap keyed by distance. */
class MinHeap {
  private keys: number[] = [];
  private values: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, value: number) {
    this.keys.push(key);
    this.values.push(value);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      [this.keys[p], this.keys[i]] = [this.keys[i], this.keys[p]];
      [this.values[p], this.values[i]] = [this.values[i], this.values[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const key = this.keys[0];
    const value = this.values[0];
    const lastKey = this.keys.pop()!;
    const lastValue = this.values.pop()!;
    if (this.keys.length) {
      this.keys[0] = lastKey;
      this.values[0] = lastValue;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        [this.keys[m], this.keys[i]] = [this.keys[i], this.keys[m]];
        [this.values[m], this.values[i]] = [this.values[i], this.values[m]];
        i = m;
      }
    }
    return [key, value];
  }
}

export type ShortestPaths = {
  /** Road distance in metres from each node to its nearest source (Infinity if unreachable). */
  dist: Float64Array;
  /** Edge used to reach each node on its shortest path (-1 for sources / unreachable). */
  prevEdge: Int32Array;
  /** Index into `sources` of the nearest source for each node (-1 if unreachable). */
  nearestSource: Int32Array;
};

/** Multi-source Dijkstra over the undirected graph, ignoring blocked edges. */
export function shortestPaths(graph: RoadGraph, sources: number[], blocked: ReadonlySet<number> = new Set()): ShortestPaths {
  const dist = new Float64Array(graph.nodeCount).fill(Infinity);
  const prevEdge = new Int32Array(graph.nodeCount).fill(-1);
  const nearestSource = new Int32Array(graph.nodeCount).fill(-1);
  const heap = new MinHeap();
  sources.forEach((node, i) => {
    if (node < 0 || dist[node] === 0) return;
    dist[node] = 0;
    nearestSource[node] = i;
    heap.push(0, node);
  });
  while (heap.size) {
    const [d, node] = heap.pop();
    if (d > dist[node]) continue;
    for (let k = graph.adjStart[node]; k < graph.adjStart[node + 1]; k++) {
      const edge = graph.adjEdge[k];
      if (blocked.has(edge)) continue;
      const next = graph.other(edge, node);
      const nd = d + graph.edgeLength[edge];
      if (nd < dist[next]) {
        dist[next] = nd;
        prevEdge[next] = edge;
        nearestSource[next] = nearestSource[node];
        heap.push(nd, next);
      }
    }
  }
  return { dist, prevEdge, nearestSource };
}

/** Edges on the shortest path from `node` back to its nearest source. */
export function pathToSource(graph: RoadGraph, paths: ShortestPaths, node: number): number[] {
  const edges: number[] = [];
  let current = node;
  let guard = graph.nodeCount;
  while (paths.prevEdge[current] !== -1 && guard-- > 0) {
    const edge = paths.prevEdge[current];
    edges.push(edge);
    current = graph.other(edge, current);
  }
  return edges;
}
