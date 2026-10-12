// Labelled synthetic scenarios (project.md §12).
//
// Each scenario is a small set of reports over the real Araniko corridor, plus what the system
// *should* conclude about them. Two things this buys us:
//
//   • the deterministic half of the pipeline — grouping, copy detection, contradictions, road
//     impact — can be measured exactly, right now, with no model involved ("oracle mode": the
//     expected claims are fed in as if extraction had produced them);
//   • the same file is the answer key for measuring extraction itself once Gemini credentials
//     exist, so nothing has to be relabelled later.
//
// This is a small hand-written set. It is evidence that the pipeline behaves as designed on cases
// we chose; it is not evidence about real-world effectiveness, and the results page says so.

import type { Claim, ContradictionKind } from "@/lib/domain/schemas";

export interface ExpectedClaim {
  type: Claim["type"];
  statement: string;
  statementEn: string;
  /** Quoted from the report; located in the text exactly as the real pipeline locates it. */
  excerptText?: string;
  hazardCategory?: string;
  roadStatus?: Claim["roadStatus"];
  roadName?: string;
  people?: NonNullable<Claim["people"]>;
  /** Which region hazard the model should have chosen, for scoring extraction. */
  expectedHazard?: string;
}

export interface ScenarioReport {
  key: string;
  text: string;
  uiLanguage: "en" | "ne";
  hazard?: string;
  location: {
    source: "gps" | "pin" | "place_name" | "none";
    lat?: number;
    lng?: number;
    accuracyM?: number;
    placeText?: string;
  };
  /** Minutes after the scenario's base time. */
  offsetMinutes: number;
  reporterToken: string;
  expectedClaims: ExpectedClaim[];
  translation?: string;
  /** A deterministic stand-in vector; keeps oracle mode free of any model call. */
  embedding: number[];
}

export interface ScenarioExpectations {
  /** Report keys that should end up in one incident together. */
  groups: string[][];
  /** Pairs that must NOT be grouped, and must never be suggested. */
  mustNotMerge: Array<[string, string]>;
  /** [copy, original] — the copy must be flagged and must not count as an independent source. */
  copies: Array<[string, string]>;
  contradictions: Array<{ kind: ContradictionKind; between: [string, string] }>;
  /** Checked after the road-blockage claims are confirmed and the analysis is run. */
  impact?: { expectBlockedRoad?: string; expectLostAccess?: string[] };
  /** Reports the system should decline to place rather than guess at. */
  abstain?: string[];
}

export interface Scenario {
  id: string;
  name: string;
  summary: string;
  /** Real geography, synthetic reports — the label every record carries. */
  baseTime: string;
  reports: ScenarioReport[];
  expectations: ScenarioExpectations;
}

const LARCHA = { lat: 27.93309, lng: 85.93534 };
const TATOPANI = { lat: 27.9385, lng: 85.9418 };
const BASE = "2026-07-14T01:30:00.000Z";

const R1_TEXT =
  "आज बिहान लार्चा नजिक अरनिको राजमार्गमा ठूलो पहिरो खस्यो। बाटो पूरै बन्द छ, सवारी अड्किएका छन्। " +
  "पहिरोले करिब डेढ सय मिटर बाटो ढाकेको छ।";
const R2_TEXT =
  "A large landslide came down across the Arniko Highway near Larcha early this morning. The road towards Tatopani " +
  "is completely blocked and several vehicles are stuck on both sides.";
const R4_TEXT = "Road is open near Larcha now. Only small debris on the shoulder and vehicles are passing normally.";
const R5_TEXT = "बाढीले खेत डुबानमा परेको छ। इन्द्रावती नदीको पानी बढेको छ।";

export const SCENARIOS: Scenario[] = [
  {
    id: "larcha-main",
    name: "Araniko corridor landslide with a forwarded copy",
    summary:
      "Two independent reports of one landslide, a forwarded copy of the first, a report saying the road is open, " +
      "a flood far away, and one report with no usable location.",
    baseTime: BASE,
    reports: [
      {
        key: "R1",
        text: R1_TEXT,
        uiLanguage: "ne",
        hazard: "landslide",
        location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng, accuracyM: 30 },
        offsetMinutes: 0,
        reporterToken: "tok_r1",
        translation:
          "A big landslide came down on the Arniko Highway near Larcha this morning. The road is completely blocked and vehicles are stuck. The landslide covers about 150 metres of road.",
        embedding: [1, 0, 0, 0],
        expectedClaims: [
          { type: "hazard", statement: "पहिरो खस्यो", statementEn: "A landslide came down", excerptText: "पहिरो खस्यो", hazardCategory: "landslide", expectedHazard: "landslide" },
          { type: "impact_road", statement: "बाटो पूरै बन्द छ", statementEn: "The road is completely blocked", excerptText: "बाटो पूरै बन्द छ", roadStatus: "blocked", roadName: "Arniko Highway" },
          { type: "event", statement: "करिब डेढ सय मिटर बाटो ढाकेको छ", statementEn: "About 150 m of road is covered", excerptText: "करिब डेढ सय मिटर बाटो ढाकेको छ" },
        ],
      },
      {
        key: "R2",
        text: R2_TEXT,
        uiLanguage: "en",
        hazard: "landslide",
        location: { source: "pin", lat: TATOPANI.lat, lng: TATOPANI.lng },
        offsetMinutes: 40,
        reporterToken: "tok_r2",
        embedding: [0.95, 0.05, 0, 0],
        expectedClaims: [
          { type: "hazard", statement: "A large landslide came down", statementEn: "A large landslide came down", excerptText: "A large landslide came down", hazardCategory: "landslide", expectedHazard: "landslide" },
          { type: "impact_road", statement: "The road towards Tatopani is completely blocked", statementEn: "The road towards Tatopani is completely blocked", excerptText: "road towards Tatopani", roadStatus: "blocked", roadName: "Araniko Rajmarg" },
        ],
      },
      {
        key: "R3",
        text: R1_TEXT,
        uiLanguage: "ne",
        hazard: "landslide",
        location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng, accuracyM: 30 },
        offsetMinutes: 110,
        reporterToken: "tok_r3",
        embedding: [1, 0, 0, 0],
        expectedClaims: [
          { type: "impact_road", statement: "बाटो पूरै बन्द छ", statementEn: "The road is completely blocked", excerptText: "बाटो पूरै बन्द छ", roadStatus: "blocked", roadName: "Arniko Highway" },
        ],
      },
      {
        key: "R4",
        text: R4_TEXT,
        uiLanguage: "en",
        hazard: "landslide",
        location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng, accuracyM: 60 },
        offsetMinutes: 135,
        reporterToken: "tok_r4",
        embedding: [0.55, 0.45, 0, 0],
        expectedClaims: [
          { type: "impact_road", statement: "The road is open", statementEn: "The road is open", excerptText: "Road is open near Larcha", roadStatus: "passable" },
        ],
      },
      {
        key: "R5",
        text: R5_TEXT,
        uiLanguage: "ne",
        hazard: "flood",
        location: { source: "gps", lat: 27.75, lng: 85.75, accuracyM: 100 },
        offsetMinutes: 150,
        reporterToken: "tok_r5",
        translation: "Fields are flooded. The Indrawati river has risen.",
        embedding: [0, 0, 1, 0],
        expectedClaims: [
          { type: "hazard", statement: "बाढीले खेत डुबानमा परेको छ", statementEn: "Fields are flooded", excerptText: "बाढीले खेत डुबानमा परेको छ", hazardCategory: "flood", expectedHazard: "flood" },
        ],
      },
      {
        key: "R6",
        text: "केही भयो, थाहा भएन। मान्छेहरू डराएका छन्।",
        uiLanguage: "ne",
        location: { source: "none" },
        offsetMinutes: 160,
        reporterToken: "tok_r6",
        translation: "Something happened, I do not know what. People are scared.",
        embedding: [0.3, 0.3, 0.3, 0],
        expectedClaims: [{ type: "observation", statement: "केही भयो, थाहा भएन", statementEn: "Something happened, unclear what", excerptText: "केही भयो" }],
      },
    ],
    expectations: {
      groups: [["R1", "R2", "R3", "R4"]],
      mustNotMerge: [
        ["R1", "R5"],
        ["R2", "R5"],
        ["R1", "R6"],
        ["R2", "R6"],
        ["R4", "R5"],
      ],
      copies: [["R3", "R1"]],
      contradictions: [{ kind: "road_status", between: ["R1", "R4"] }],
      impact: { expectBlockedRoad: "Arniko Highway", expectLostAccess: ["Tatopani"] },
      abstain: ["R6"],
    },
  },

  {
    id: "distinct-events",
    name: "Two different hazards close together",
    summary: "A landslide and a fire reported from almost the same place at almost the same time. They are not one incident.",
    baseTime: "2026-08-02T06:00:00.000Z",
    reports: [
      {
        key: "A1",
        text: "A landslide has come down across the highway just north of Larcha. The road is blocked in both directions.",
        uiLanguage: "en",
        hazard: "landslide",
        location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng, accuracyM: 40 },
        offsetMinutes: 0,
        reporterToken: "tok_a1",
        embedding: [1, 0, 0, 0.1],
        expectedClaims: [
          { type: "hazard", statement: "A landslide has come down", statementEn: "A landslide has come down", excerptText: "A landslide has come down", hazardCategory: "landslide", expectedHazard: "landslide" },
          { type: "impact_road", statement: "The road is blocked in both directions", statementEn: "The road is blocked in both directions", excerptText: "blocked in both directions", roadStatus: "blocked" },
        ],
      },
      {
        key: "A2",
        text: "A house is on fire near Larcha and the flames are spreading to the next building. We need water.",
        uiLanguage: "en",
        hazard: "fire",
        location: { source: "gps", lat: LARCHA.lat + 0.004, lng: LARCHA.lng + 0.003, accuracyM: 40 },
        offsetMinutes: 20,
        reporterToken: "tok_a2",
        embedding: [0.1, 0, 0, 1],
        expectedClaims: [
          { type: "hazard", statement: "A house is on fire", statementEn: "A house is on fire", excerptText: "A house is on fire", hazardCategory: "fire", expectedHazard: "fire" },
          { type: "need", statement: "We need water", statementEn: "We need water", excerptText: "We need water" },
        ],
      },
    ],
    expectations: {
      groups: [["A1"], ["A2"]],
      mustNotMerge: [["A1", "A2"]],
      copies: [],
      contradictions: [],
    },
  },

  {
    id: "copy-only",
    name: "The same message forwarded twice",
    summary: "One report and its identical copy from another device, with nothing else in the area.",
    baseTime: "2026-08-09T03:00:00.000Z",
    reports: [
      {
        key: "C1",
        text: "The bridge over the Indrawati at Dolalghat is damaged and only one lane is open. Heavy vehicles are waiting.",
        uiLanguage: "en",
        hazard: "flood",
        location: { source: "gps", lat: 27.6333, lng: 85.7333, accuracyM: 50 },
        offsetMinutes: 0,
        reporterToken: "tok_c1",
        embedding: [0.4, 0.6, 0, 0],
        expectedClaims: [
          { type: "impact_road", statement: "The bridge is damaged", statementEn: "The bridge is damaged", excerptText: "bridge over the Indrawati at Dolalghat is damaged", roadStatus: "damaged" },
        ],
      },
      {
        key: "C2",
        text: "The bridge over the Indrawati at Dolalghat is damaged and only one lane is open. Heavy vehicles are waiting.",
        uiLanguage: "en",
        hazard: "flood",
        location: { source: "gps", lat: 27.6333, lng: 85.7333, accuracyM: 50 },
        offsetMinutes: 25,
        reporterToken: "tok_c2",
        embedding: [0.4, 0.6, 0, 0],
        expectedClaims: [
          { type: "impact_road", statement: "The bridge is damaged", statementEn: "The bridge is damaged", excerptText: "bridge over the Indrawati at Dolalghat is damaged", roadStatus: "damaged" },
        ],
      },
    ],
    expectations: {
      groups: [["C1", "C2"]],
      mustNotMerge: [],
      copies: [["C2", "C1"]],
      contradictions: [],
    },
  },

  {
    id: "counts-disagree",
    name: "The same event with different casualty counts",
    summary: "Two reports of one flood agree on the place and the event but disagree on how many people are injured.",
    baseTime: "2026-08-16T09:00:00.000Z",
    reports: [
      {
        key: "D1",
        text: "Flood water has reached the houses near the river at Dolalghat. Three people are injured and the road is under water.",
        uiLanguage: "en",
        hazard: "flood",
        location: { source: "gps", lat: 27.6333, lng: 85.7333, accuracyM: 80 },
        offsetMinutes: 0,
        reporterToken: "tok_d1",
        embedding: [0.2, 0.8, 0, 0],
        expectedClaims: [
          { type: "hazard", statement: "Flood water has reached the houses", statementEn: "Flood water has reached the houses", excerptText: "Flood water has reached the houses", hazardCategory: "flood", expectedHazard: "flood" },
          { type: "impact_people", statement: "Three people are injured", statementEn: "Three people are injured", excerptText: "Three people are injured", people: { kind: "injured", count: 3 } },
          { type: "impact_road", statement: "The road is under water", statementEn: "The road is under water", excerptText: "the road is under water", roadStatus: "blocked" },
        ],
      },
      {
        key: "D2",
        text: "Water is over the road at Dolalghat and one person has been injured near the river bank.",
        uiLanguage: "en",
        hazard: "flood",
        location: { source: "gps", lat: 27.634, lng: 85.734, accuracyM: 90 },
        offsetMinutes: 35,
        reporterToken: "tok_d2",
        embedding: [0.2, 0.8, 0, 0],
        expectedClaims: [
          { type: "hazard", statement: "Water is over the road", statementEn: "Water is over the road", excerptText: "Water is over the road", hazardCategory: "flood", expectedHazard: "flood" },
          { type: "impact_people", statement: "One person has been injured", statementEn: "One person has been injured", excerptText: "one person has been injured", people: { kind: "injured", count: 1 } },
        ],
      },
    ],
    expectations: {
      groups: [["D1", "D2"]],
      mustNotMerge: [],
      copies: [],
      contradictions: [{ kind: "people_count", between: ["D1", "D2"] }],
    },
  },

  {
    id: "abstain",
    name: "A report that cannot be placed",
    summary: "A report with no location and no recognisable place name. The system should decline to compare it rather than guess.",
    baseTime: "2026-08-23T02:00:00.000Z",
    reports: [
      {
        key: "E1",
        text: "The road is blocked somewhere up the highway, I could not see exactly where. Be careful.",
        uiLanguage: "en",
        hazard: "landslide",
        location: { source: "none" },
        offsetMinutes: 0,
        reporterToken: "tok_e1",
        embedding: [0.5, 0.2, 0, 0.3],
        expectedClaims: [
          { type: "impact_road", statement: "The road is blocked", statementEn: "The road is blocked", excerptText: "road is blocked", roadStatus: "blocked" },
        ],
      },
      {
        key: "E2",
        text: "A landslide has blocked the highway near Larcha this morning and nothing can get through.",
        uiLanguage: "en",
        hazard: "landslide",
        location: { source: "gps", lat: LARCHA.lat, lng: LARCHA.lng, accuracyM: 50 },
        offsetMinutes: 30,
        reporterToken: "tok_e2",
        embedding: [1, 0, 0, 0],
        expectedClaims: [
          { type: "hazard", statement: "A landslide has blocked the highway", statementEn: "A landslide has blocked the highway", excerptText: "landslide has blocked the highway", hazardCategory: "landslide", expectedHazard: "landslide" },
          { type: "impact_road", statement: "Nothing can get through", statementEn: "Nothing can get through", excerptText: "nothing can get through", roadStatus: "blocked" },
        ],
      },
    ],
    expectations: {
      groups: [["E1"], ["E2"]],
      mustNotMerge: [["E1", "E2"]],
      copies: [],
      contradictions: [],
      abstain: ["E1"],
    },
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}

/** The demo scenario the seed script uses — the biggest one, so the UI has something to show. */
export const DEMO_SCENARIO_ID = "larcha-main";
