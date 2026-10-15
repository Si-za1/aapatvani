import { describe, expect, it } from "vitest";
import { describeLocation, incidentLocationView, reportLocationView } from "@/lib/location-view";
import type { Claim, Incident } from "@/lib/domain/schemas";
import { makeClaim, makeReport } from "./helpers/fixtures";

// The states a reviewer has to tell apart. Before this, the incident page rendered the first and
// the last identically ("No location established") and dropped the two in the middle, including
// the place name the reporter had actually typed.

function resolvedClaim(): Claim {
  return makeClaim({
    id: "clm_place",
    reportId: "rep_TESTREPORT0001",
    type: "location",
    place: {
      text: "लार्चा",
      romanized: "Larcha",
      kind: "settlement",
      resolved: {
        placeId: "osm:node/8702386484",
        name: "Larcha",
        lat: 27.9385,
        lng: 85.9418,
        uncertaintyM: 150,
        matchType: "exact",
        datasetId: "np-araniko-corridor",
      },
    },
  });
}

function incident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: "inc_TEST",
    regionId: "np",
    dataLabel: "synthetic",
    title: "Flood near Devighat",
    hazard: { category: "flood", source: "reporter" },
    status: "candidate",
    members: [],
    reportIds: [],
    firstReportedAt: "2026-07-14T01:30:00.000Z",
    lastReportedAt: "2026-07-14T01:30:00.000Z",
    independentSources: 1,
    openContradictions: 0,
    createdAt: "2026-07-14T01:30:00.000Z",
    updatedAt: "2026-07-14T01:30:00.000Z",
    createdBy: "system",
    ...overrides,
  };
}

describe("reportLocationView", () => {
  it("treats a GPS fix and a dropped pin as measured positions", () => {
    const gps = reportLocationView(makeReport({ location: { source: "gps", lat: 27.93, lng: 85.93, accuracyM: 30 } }));
    expect(gps.kind).toBe("mapped");
    expect(describeLocation(gps).qualifier).toContain("±30 m");

    const pin = reportLocationView(makeReport({ location: { source: "pin", lat: 27.93, lng: 85.93 } }));
    expect(pin.kind).toBe("mapped");
    // No accuracy was sent, so the pin's default uncertainty is what is quoted.
    expect(describeLocation(pin).qualifier).toContain("±150 m");
  });

  it("calls a name the gazetteer recognised approximate, and shows the name rather than coordinates", () => {
    const report = makeReport({ location: { source: "place_name", placeText: "लार्चा" } });
    const view = reportLocationView(report, [resolvedClaim()]);
    expect(view.kind).toBe("approximate");
    const text = describeLocation(view);
    expect(text.headline).toBe("लार्चा");
    expect(text.qualifier).toContain("±150 m");
  });

  it("keeps a name it could not place, instead of discarding it as 'no location'", () => {
    // The report that started this: a typed place name the corridor gazetteer does not cover.
    const report = makeReport({ location: { source: "place_name", placeText: "devighat bidhhur" } });
    const view = reportLocationView(report, []);
    expect(view.kind).toBe("named");
    const text = describeLocation(view);
    expect(text.headline).toBe("devighat bidhhur");
    expect(text.note).toContain("not compared with others by distance");
  });

  it("ignores an ambiguous place match rather than picking one", () => {
    const ambiguous = resolvedClaim();
    ambiguous.place = { ...ambiguous.place!, ambiguous: true };
    const report = makeReport({ location: { source: "place_name", placeText: "Larcha" } });
    expect(reportLocationView(report, [ambiguous]).kind).toBe("named");
  });

  it("reports nothing at all as not given", () => {
    const view = reportLocationView(makeReport({ location: { source: "none" } }));
    expect(view.kind).toBe("unknown");
    expect(describeLocation(view).headline).toBe("Not given");
  });
});

describe("incidentLocationView", () => {
  it("describes an incident position that came from a matched name as approximate", () => {
    const view = incidentLocationView(
      incident({
        location: { lat: 27.9385, lng: 85.9418, uncertaintyM: 150, source: "gazetteer", basisReportId: "rep_1" },
      }),
      [makeReport({ location: { source: "place_name", placeText: "Larcha" } })],
    );
    expect(view.kind).toBe("approximate");
    expect(describeLocation(view).headline).toBe("Larcha");
  });

  it("falls back to the place a member report named when there is no position", () => {
    const view = incidentLocationView(incident(), [makeReport({ location: { source: "place_name", placeText: "devighat bidhhur" } })]);
    expect(view.kind).toBe("named");
    expect(describeLocation(view).headline).toBe("devighat bidhhur");
  });

  it("says not given only when no report carried anything", () => {
    expect(incidentLocationView(incident(), [makeReport({ location: { source: "none" } })]).kind).toBe("unknown");
    expect(incidentLocationView(incident(), []).kind).toBe("unknown");
  });
});
