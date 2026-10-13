import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, parsePrefs } from "@/lib/pref-choices";
import { greeting } from "@/lib/time";

// Reviewer preferences are read from a cookie on every page, so the reader has to be boring: it
// either returns something one of the choices offered, or it returns the default. A cookie written
// by an older build, or edited by hand, must never reach a page as a value that page cannot render.

describe("reviewer preferences", () => {
  it("falls back to the defaults for anything missing or unreadable", () => {
    expect(parsePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("not json")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("[]")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('"a string"')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("null")).toEqual(DEFAULT_PREFS);
  });

  it("keeps a window that is one of the offered choices", () => {
    expect(parsePrefs('{"windowHours":24,"queue":"all"}')).toEqual({ windowHours: 24, queue: "all" });
    expect(parsePrefs('{"windowHours":0,"queue":"awaiting"}')).toEqual(DEFAULT_PREFS);
  });

  it("rejects a window or queue that was never offered", () => {
    // 48 hours is a plausible thing to write by hand and is not a choice the settings page offers.
    expect(parsePrefs('{"windowHours":48,"queue":"awaiting"}').windowHours).toBe(0);
    expect(parsePrefs('{"windowHours":"24","queue":"awaiting"}').windowHours).toBe(0);
    expect(parsePrefs('{"windowHours":24,"queue":"everything"}').queue).toBe("awaiting");
    expect(parsePrefs('{"windowHours":24,"queue":null}').queue).toBe("awaiting");
  });

  it("keeps the half it can read", () => {
    expect(parsePrefs('{"windowHours":168,"queue":"nonsense"}')).toEqual({ windowHours: 168, queue: "awaiting" });
  });
});

// The greeting is the first line of the dashboard, and it is spoken in the region's time zone, not
// the server's, which is the whole reason this is a function rather than three lines at a call site.
describe("greeting", () => {
  it("reads the hour in Kathmandu, not on the server", () => {
    // 2026-10-13T00:30:00Z is 06:15 in Kathmandu (+05:45): morning there, still the previous day in UTC.
    expect(greeting("2026-10-13T00:30:00Z")).toBe("Good morning");
    // 08:00Z is 13:45 in Kathmandu.
    expect(greeting("2026-10-13T08:00:00Z")).toBe("Good afternoon");
    // 13:00Z is 18:45 in Kathmandu.
    expect(greeting("2026-10-13T13:00:00Z")).toBe("Good evening");
  });

  it("handles midnight without calling it the evening", () => {
    // 18:15Z is 00:00 in Kathmandu, the hour where a 12-hour clock says "12" and a naive read would
    // put the greeting at the wrong end of the day.
    expect(greeting("2026-10-13T18:15:00Z")).toBe("Good morning");
  });
});
