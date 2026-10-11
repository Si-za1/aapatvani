// Deterministic geometry helpers. Pure functions, no I/O.
// Distances are metres on a spherical Earth; local projections are used only
// for short distances (point-to-segment), where the error is negligible.

export type LatLng = { lat: number; lng: number };
/** [south, west, north, east] */
export type BBox = [number, number, number, number];

const EARTH_RADIUS_M = 6371008.8;
const DEG = Math.PI / 180;

export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (bLat - aLat) * DEG;
  const dLng = (bLng - aLng) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function distanceM(a: LatLng, b: LatLng): number {
  return haversineM(a.lat, a.lng, b.lat, b.lng);
}

/** Equirectangular projection around a reference latitude, in metres. */
function project(lat: number, lng: number, refLat: number): [number, number] {
  return [lng * DEG * EARTH_RADIUS_M * Math.cos(refLat * DEG), lat * DEG * EARTH_RADIUS_M];
}

export type SegmentHit = { distanceM: number; t: number; lat: number; lng: number };

/** Shortest distance from point p to segment a→b, with the projection parameter t in [0, 1]. */
export function pointToSegment(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): SegmentHit {
  const [px, py] = project(pLat, pLng, pLat);
  const [ax, ay] = project(aLat, aLng, pLat);
  const [bx, by] = project(bLat, bLng, pLat);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const lat = aLat + (bLat - aLat) * t;
  const lng = aLng + (bLng - aLng) * t;
  return { distanceM: haversineM(pLat, pLng, lat, lng), t, lat, lng };
}

/** Distance from a point to a polyline stored as a flat [lat, lng, lat, lng, ...] array. */
export function pointToPolyline(
  pLat: number,
  pLng: number,
  flat: ArrayLike<number>,
  offset = 0,
  count = flat.length / 2,
): SegmentHit & { segment: number } {
  let best: SegmentHit & { segment: number } = {
    distanceM: Infinity,
    t: 0,
    lat: NaN,
    lng: NaN,
    segment: -1,
  };
  if (count === 1) {
    const lat = flat[offset * 2];
    const lng = flat[offset * 2 + 1];
    return { distanceM: haversineM(pLat, pLng, lat, lng), t: 0, lat, lng, segment: 0 };
  }
  for (let i = 0; i < count - 1; i++) {
    const j = (offset + i) * 2;
    const hit = pointToSegment(pLat, pLng, flat[j], flat[j + 1], flat[j + 2], flat[j + 3]);
    if (hit.distanceM < best.distanceM) best = { ...hit, segment: i };
  }
  return best;
}

export function polylineLengthM(flat: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i + 3 < flat.length; i += 2) {
    total += haversineM(flat[i], flat[i + 1], flat[i + 2], flat[i + 3]);
  }
  return total;
}

/** Douglas–Peucker simplification of a flat polyline; endpoints are always kept. */
export function simplifyPolyline(flat: number[], toleranceM: number): number[] {
  const n = flat.length / 2;
  if (n <= 2) return flat.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = pointToSegment(
        flat[i * 2],
        flat[i * 2 + 1],
        flat[first * 2],
        flat[first * 2 + 1],
        flat[last * 2],
        flat[last * 2 + 1],
      ).distanceM;
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > toleranceM) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(flat[i * 2], flat[i * 2 + 1]);
  return out;
}

/** True when the point lies inside the bbox, optionally expanded by a margin in metres. */
export function bboxContains(bbox: BBox, lat: number, lng: number, marginM = 0): boolean {
  const [s, w, n, e] = bbox;
  const dLat = marginM / (EARTH_RADIUS_M * DEG);
  const dLng = marginM / (EARTH_RADIUS_M * DEG * Math.cos(lat * DEG));
  return lat >= s - dLat && lat <= n + dLat && lng >= w - dLng && lng <= e + dLng;
}

export function roundCoord(value: number, digits = 5): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function formatKm(metres: number): string {
  if (!Number.isFinite(metres)) return "no route";
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
}
