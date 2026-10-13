import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEAD, MIN_GAP, SLOT, layoutAxis } from "@/lib/timeline/layout";
import type { TimelineEntry, TimelineKind } from "@/lib/timeline/types";

// Pinned to a zone that is not UTC, and put back afterwards. The failure this file guards against
// is invisible where the local clock is UTC, so a suite that inherited the machine's zone would pass
// on a build server and fail on a laptop in Kathmandu, which is the wrong way round. Restoring it
// matters because process.env belongs to the whole test worker, not to this file.
const ambientZone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Asia/Kathmandu";
});
afterAll(() => {
  if (ambientZone === undefined) delete process.env.TZ;
  else process.env.TZ = ambientZone;
});

function entry(at: string, kind: TimelineKind = "report", id = `${kind}:${at}`): TimelineEntry {
  return { id, at, kind, actor: kind === "report" ? "public" : "system", title: kind, about: "AV-TEST" };
}

// The placement is the one piece of the timeline that is arithmetic, and the bug it had was quiet:
// marker positions are computed from real ISO timestamps, but the bucket key is the same instant cut
// to the minute, and "2026-07-14T07:15" has no time zone in it. Feeding that key back into
// `Date.parse` reads it as local time, which on a machine that is not in Nepal is a different
// instant, and the markers march off the side of the drawing. These tests hold both halves.
describe("placing the markers", () => {
  it("puts the first moment at the left margin", () => {
    const layout = layoutAxis([entry("2026-07-14T01:30:00.000Z")]);
    expect(layout.markers).toHaveLength(1);
    expect(layout.markers[0].x).toBe(LEAD);
  });

  it("keeps every marker inside the drawing, whatever the time zone of the reader", () => {
    // Late-evening UTC and early-morning UTC, the pair most likely to land on different calendar
    // days for a reader east of Nepal.
    const entries = [
      entry("2026-07-13T23:50:00.000Z"),
      entry("2026-07-14T00:05:00.000Z"),
      entry("2026-07-14T01:30:00.000Z"),
      entry("2026-07-14T04:10:00.000Z"),
    ];
    const layout = layoutAxis(entries);
    const right = layout.width;

    for (const marker of layout.markers) {
      expect(marker.x).toBeGreaterThanOrEqual(LEAD);
      expect(marker.x + SLOT).toBeLessThanOrEqual(right + 1);
    }
  });

  it("spans the earliest moment to the latest across the whole line", () => {
    // Four moments over three days: far enough apart that the floor never binds, so the positions
    // are exactly their share of the span and can be asserted to the pixel. This is the assertion
    // that catches a span measured on one clock and a marker placed on another.
    const layout = layoutAxis([
      entry("2026-07-14T01:30:00.000Z"),
      entry("2026-07-15T01:30:00.000Z"),
      entry("2026-07-16T01:30:00.000Z"),
      entry("2026-07-17T01:30:00.000Z"),
    ]);

    const travel = 1180 - LEAD - SLOT;
    expect(layout.markers[0].x).toBe(LEAD);
    expect(layout.markers[1].x).toBe(LEAD + travel / 3);
    expect(layout.markers[3].x).toBe(LEAD + travel);
  });

  it("orders markers oldest first, and positions them in that order", () => {
    const layout = layoutAxis([
      entry("2026-07-14T04:10:00.000Z"),
      entry("2026-07-14T01:30:00.000Z"),
      entry("2026-07-14T02:30:00.000Z"),
    ]);

    expect(layout.markers.map((m) => m.at)).toEqual([
      "2026-07-14T01:30:00.000Z",
      "2026-07-14T02:30:00.000Z",
      "2026-07-14T04:10:00.000Z",
    ]);
    const [a, b, c] = layout.markers;
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
  });

  it("never lets two markers sit closer than the floor", () => {
    // Four reports inside two minutes: the spacing has to give, because four labels at their true
    // time positions would be one unreadable pile.
    const layout = layoutAxis([
      entry("2026-07-14T01:30:00.000Z"),
      entry("2026-07-14T01:30:20.000Z"),
      entry("2026-07-14T01:31:10.000Z"),
      entry("2026-07-14T01:31:40.000Z"),
    ]);

    for (let i = 1; i < layout.markers.length; i++) {
      expect(layout.markers[i].x - layout.markers[i - 1].x).toBeGreaterThanOrEqual(MIN_GAP);
    }
  });

  it("treats entries in the same minute as one moment, whichever second they landed on", () => {
    // A report and the model that read it 400 milliseconds later are one event, and drawing them as
    // two markers a floor apart would say there were two.
    const layout = layoutAxis([
      entry("2026-07-14T02:10:00.000Z", "report", "r1"),
      entry("2026-07-14T02:10:00.400Z", "read", "x1"),
      entry("2026-07-14T03:20:00.000Z", "report", "r2"),
    ]);

    expect(layout.markers).toHaveLength(2);
    expect(layout.markers[0].below.map((e) => e.id)).toEqual(["x1"]);
    // Labelled with the moment it happened, not with the minute it was rounded into.
    expect(layout.markers[0].at).toBe("2026-07-14T02:10:00.000Z");
  });

  it("keeps the community's report above the line and everything done about it below", () => {
    const layout = layoutAxis([
      entry("2026-07-14T02:10:00.000Z", "review", "c1"),
      entry("2026-07-14T02:10:00.000Z", "report", "r1"),
      entry("2026-07-14T02:10:00.000Z", "read", "x1"),
    ]);

    expect(layout.markers[0].above?.id).toBe("r1");
    // and in chain order below, whatever order they arrived in
    expect(layout.markers[0].below.map((e) => e.id)).toEqual(["x1", "c1"]);
  });

  it("leaves a moment with nothing reported above the line empty", () => {
    const layout = layoutAxis([entry("2026-07-14T01:30:00.000Z", "incident")]);
    expect(layout.markers[0].above).toBeUndefined();
    expect(layout.markers[0].below).toHaveLength(1);
  });

  it("never draws narrower than the nominal width, and widens when the markers need it", () => {
    expect(layoutAxis([entry("2026-07-14T01:30:00.000Z")]).width).toBe(1180);

    const many = Array.from({ length: 14 }, (_, i) =>
      entry(`2026-07-14T${String(i).padStart(2, "0")}:00:00.000Z`, "report", `r${i}`),
    );
    const layout = layoutAxis(many);
    expect(layout.width).toBeGreaterThan(1180);
    expect(layout.width).toBeGreaterThanOrEqual(layout.markers[13].x + SLOT);
  });

  it("returns nothing for nothing", () => {
    expect(layoutAxis([])).toEqual({ markers: [], width: 1180, depth: 0 });
  });

  it("reports the deepest stack, so the drawing can be given room", () => {
    const layout = layoutAxis([
      entry("2026-07-14T01:30:00.000Z", "report", "r1"),
      entry("2026-07-14T01:30:00.000Z", "read", "x1"),
      entry("2026-07-14T01:30:00.000Z", "review", "c1"),
      entry("2026-07-14T02:30:00.000Z", "report", "r2"),
    ]);
    expect(layout.depth).toBe(2);
  });
});
