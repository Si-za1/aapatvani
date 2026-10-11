import { describe, expect, it } from "vitest";
import { bboxContains, formatKm, haversineM, pointToSegment, polylineLengthM, simplifyPolyline } from "@/lib/geo/math";

describe("geo math", () => {
  it("measures one degree of latitude as about 111.2 km", () => {
    expect(haversineM(27, 85, 28, 85)).toBeGreaterThan(111_100);
    expect(haversineM(27, 85, 28, 85)).toBeLessThan(111_300);
  });

  it("is symmetric and zero for identical points", () => {
    expect(haversineM(27.9, 85.9, 27.95, 85.94)).toBeCloseTo(haversineM(27.95, 85.94, 27.9, 85.9), 6);
    expect(haversineM(27.9, 85.9, 27.9, 85.9)).toBe(0);
  });

  it("projects a point onto a segment and clamps to the endpoints", () => {
    const mid = pointToSegment(27.001, 85.015, 27, 85.01, 27, 85.02);
    expect(mid.t).toBeCloseTo(0.5, 2);
    expect(mid.distanceM).toBeGreaterThan(105);
    expect(mid.distanceM).toBeLessThan(117);
    const beyond = pointToSegment(27, 85.03, 27, 85.01, 27, 85.02);
    expect(beyond.t).toBe(1);
    expect(beyond.distanceM).toBeCloseTo(haversineM(27, 85.03, 27, 85.02), 3);
  });

  it("simplifies a polyline but always keeps both endpoints", () => {
    const line = [27, 85, 27.00001, 85.001, 27, 85.002, 27, 85.003];
    const simple = simplifyPolyline(line, 5);
    expect(simple.slice(0, 2)).toEqual([27, 85]);
    expect(simple.slice(-2)).toEqual([27, 85.003]);
    expect(simple.length).toBeLessThan(line.length);
    expect(polylineLengthM(simple)).toBeCloseTo(polylineLengthM([27, 85, 27, 85.003]), 0);
  });

  it("checks bounding boxes with an optional margin", () => {
    const bbox: [number, number, number, number] = [27.62, 85.68, 28.0, 86.02];
    expect(bboxContains(bbox, 27.94, 85.95)).toBe(true);
    expect(bboxContains(bbox, 28.005, 85.95)).toBe(false);
    expect(bboxContains(bbox, 28.005, 85.95, 1000)).toBe(true);
  });

  it("formats distances for people", () => {
    expect(formatKm(420)).toBe("420 m");
    expect(formatKm(2349)).toBe("2.3 km");
    expect(formatKm(23_400)).toBe("23 km");
    expect(formatKm(Infinity)).toBe("no route");
  });
});
