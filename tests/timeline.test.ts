import { describe, expect, it } from "vitest";
import { groupEntries } from "@/lib/timeline/group";
import type { TimelineEntry } from "@/lib/timeline/service";

// The timeline's grouping is the one piece of it with arithmetic in it, and the arithmetic has a
// time zone in it, so it is the piece worth pinning down. A row landing in the wrong day bucket is
// the kind of wrong that still looks tidy on the screen.

function entry(at: string, id = at): TimelineEntry {
  return { id, at, kind: "report", actor: "public", title: "Report received" };
}

const KATHMANDU = "Asia/Kathmandu";

describe("grouping the timeline", () => {
  it("reads the day in the region's time zone, not the server's", () => {
    // 19:00Z on the 12th is 00:45 on the 13th in Kathmandu (+05:45). If this bucketed on UTC it
    // would be filed under the 12th, and a reviewer reading "Today" would not find it there.
    const now = "2026-10-13T06:00:00Z";
    const groups = groupEntries([entry("2026-10-12T19:00:00Z")], "day", now, KATHMANDU);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].key).toBe("2026-10-13");
  });

  it("calls the previous day Yesterday and dates anything older", () => {
    const now = "2026-10-13T06:00:00Z";
    const groups = groupEntries(
      [entry("2026-10-12T06:00:00Z"), entry("2026-07-14T02:10:00Z")],
      "day",
      now,
      KATHMANDU,
    );

    expect(groups.map((g) => g.label)).toEqual(["Yesterday", "14 Jul 2026"]);
  });

  it("starts the week on Monday", () => {
    // 2026-10-11 is a Sunday. In a Monday-start week it belongs to the week beginning 5 October,
    // which is the one people coming off a Sunday shift would expect to see it in.
    const now = "2026-10-13T06:00:00Z";
    const groups = groupEntries(
      [entry("2026-10-11T06:00:00Z"), entry("2026-10-13T06:00:00Z")],
      "week",
      now,
      KATHMANDU,
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("This week");
    expect(groups[0].key).toBe("2026-10-12");
    // The week beginning 5 October is last week, and saying so beats printing a date range nobody
    // has to work out.
    expect(groups[1].label).toBe("Last week");
    expect(groups[1].key).toBe("2026-10-05");
  });

  it("names an older week by its range", () => {
    const groups = groupEntries([entry("2026-09-30T06:00:00Z")], "week", "2026-10-13T06:00:00Z", KATHMANDU);
    expect(groups[0].label).toBe("28 Sep – 4 Oct 2026");
  });

  it("spans a month boundary in a week label without lying about it", () => {
    const groups = groupEntries([entry("2026-07-02T06:00:00Z")], "week", "2026-10-13T06:00:00Z", KATHMANDU);
    expect(groups[0].label).toBe("29 Jun – 5 Jul 2026");
  });

  it("groups by month, naming the current and previous ones", () => {
    const now = "2026-10-13T06:00:00Z";
    const groups = groupEntries(
      [entry("2026-10-02T06:00:00Z"), entry("2026-09-20T06:00:00Z"), entry("2026-07-14T06:00:00Z")],
      "month",
      now,
      KATHMANDU,
    );

    expect(groups.map((g) => g.label)).toEqual(["This month", "Last month", "July 2026"]);
  });

  it("keeps every entry, and keeps the order it was given inside each group", () => {
    const entries = [
      entry("2026-10-13T08:00:00Z", "a"),
      entry("2026-10-13T07:00:00Z", "b"),
      entry("2026-10-13T09:00:00Z", "c"),
    ];
    const groups = groupEntries(entries, "day", "2026-10-13T10:00:00Z", KATHMANDU);

    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts groups newest first, whatever order they arrived in", () => {
    const groups = groupEntries(
      [entry("2026-07-14T06:00:00Z"), entry("2026-10-13T06:00:00Z"), entry("2026-08-01T06:00:00Z")],
      "day",
      "2026-10-13T10:00:00Z",
      KATHMANDU,
    );

    expect(groups.map((g) => g.key)).toEqual(["2026-10-13", "2026-08-01", "2026-07-14"]);
  });

  it("drops an unparseable timestamp rather than failing the page", () => {
    const groups = groupEntries([entry("not a date"), entry("2026-10-13T06:00:00Z")], "day", "2026-10-13T10:00:00Z", KATHMANDU);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(1);
  });

  it("returns nothing for nothing, rather than a group with no entries", () => {
    expect(groupEntries([], "day", "2026-10-13T10:00:00Z", KATHMANDU)).toEqual([]);
  });
});
