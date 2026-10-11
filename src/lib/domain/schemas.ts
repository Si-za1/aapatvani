// The shared data contract. Every stored record is validated against these schemas.
//
// Trust model: every claim and finding carries an ORIGIN (who produced it) and a
// REVIEW STATUS (what a person decided). "Confirmed" only ever comes from a human action.
// Firestore note: no nested arrays — polylines are flat [lat, lng, ...] number arrays.

import { z } from "zod";

export const DataLabel = z.enum(["synthetic", "historical", "operational"]);
export type DataLabel = z.infer<typeof DataLabel>;

/** Who produced a piece of information. */
export const Origin = z.enum(["reporter", "ai", "computed", "reviewer"]);
export type Origin = z.infer<typeof Origin>;

/** What a reviewer decided about it. */
export const ReviewStatus = z.enum(["unreviewed", "confirmed", "edited", "rejected", "needs_info"]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

export const LatLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export type LatLng = z.infer<typeof LatLng>;

export const Actor = z.object({
  kind: z.enum(["human", "ai", "system", "public"]),
  id: z.string(),
  name: z.string().optional(),
  model: z.string().optional(),
});
export type Actor = z.infer<typeof Actor>;

export const ReviewDecision = z.object({
  status: ReviewStatus,
  by: z.object({ id: z.string(), name: z.string() }).optional(),
  at: z.string().optional(),
  note: z.string().optional(),
});
export type ReviewDecision = z.infer<typeof ReviewDecision>;

// ---------------------------------------------------------------- Reports

export const MediaItem = z.object({
  id: z.string(),
  kind: z.enum(["photo", "audio"]),
  mimeType: z.string(),
  sizeBytes: z.number(),
  sha256: z.string(),
  storagePath: z.string(),
  originalName: z.string().optional(),
  /** Disclosed to the reporter at upload time, e.g. "Resized in the browser to fit the upload limit". */
  clientTransform: z.string().optional(),
  durationSec: z.number().optional(),
  exif: z
    .object({
      takenAt: z.string().optional(),
      gps: LatLng.optional(),
      cameraModel: z.string().optional(),
    })
    .optional(),
  /** Attribution for demo images that come from open-licensed sources. */
  attribution: z.string().optional(),
});
export type MediaItem = z.infer<typeof MediaItem>;

export const LocationSource = z.enum(["gps", "pin", "place_name", "none"]);
export type LocationSource = z.infer<typeof LocationSource>;

export const ReportLocation = z.object({
  source: LocationSource,
  lat: z.number().optional(),
  lng: z.number().optional(),
  accuracyM: z.number().optional(),
  /** Place name exactly as the reporter typed it. */
  placeText: z.string().optional(),
});
export type ReportLocation = z.infer<typeof ReportLocation>;

export const TimeHint = z.enum(["now", "earlier_today", "yesterday", "unsure"]);
export type TimeHint = z.infer<typeof TimeHint>;

export const ReportStatus = z.enum(["received", "extracting", "extracted", "extraction_failed", "ai_unavailable"]);
export type ReportStatus = z.infer<typeof ReportStatus>;

export const Report = z.object({
  id: z.string(),
  referenceCode: z.string(),
  regionId: z.string(),
  dataLabel: DataLabel,
  /** Verbatim text from the reporter. Never modified. */
  text: z.string(),
  uiLanguage: z.enum(["en", "ne"]),
  /** Hazard the reporter picked themselves, if any — a reporter claim, not an AI output. */
  reporterHazard: z.string().optional(),
  location: ReportLocation,
  timeHint: TimeHint.optional(),
  reportedTimeText: z.string().optional(),
  submittedAt: z.string(),
  media: z.array(MediaItem),
  reporterToken: z.string(),
  submitTokenHash: z.string().optional(),
  status: ReportStatus,
  statusDetail: z.string().optional(),
  latestExtractionId: z.string().optional(),
  incidentId: z.string().optional(),
  /** Scenario bookkeeping for synthetic data (e.g. eval keys). */
  scenario: z.object({ id: z.string(), key: z.string() }).optional(),
});
export type Report = z.infer<typeof Report>;

// ---------------------------------------------------------------- Claims

export const ClaimType = z.enum([
  "hazard",
  "event",
  "location",
  "time",
  "impact_road",
  "impact_people",
  "impact_structure",
  "impact_service",
  "need",
  "observation",
  "other",
]);
export type ClaimType = z.infer<typeof ClaimType>;

export const ClaimBasis = z.enum(["report_text", "voice_note", "photo", "inference", "reviewer", "metadata"]);
export type ClaimBasis = z.infer<typeof ClaimBasis>;

export const RoadStatus = z.enum(["blocked", "partially_blocked", "damaged", "passable", "unknown"]);
export type RoadStatus = z.infer<typeof RoadStatus>;

export const PeopleKind = z.enum(["injured", "missing", "dead", "trapped", "displaced", "safe", "unknown"]);

export const ResolvedPlace = z.object({
  placeId: z.string(),
  name: z.string(),
  nameNe: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  uncertaintyM: z.number(),
  matchType: z.enum(["exact", "exact_ne", "alias", "fuzzy", "transliteration"]),
  datasetId: z.string(),
});
export type ResolvedPlace = z.infer<typeof ResolvedPlace>;

export const Claim = z.object({
  id: z.string(),
  reportId: z.string(),
  extractionId: z.string(),
  regionId: z.string(),
  type: ClaimType,
  /** In the report's own language where the claim comes from the reporter's words. */
  statement: z.string(),
  statementEn: z.string(),
  origin: Origin,
  basis: ClaimBasis,
  excerpt: z
    .object({
      text: z.string(),
      verified: z.boolean(),
      /** Which reporter-written field the excerpt was found in. "transcript" means the AI transcript of the voice note. */
      field: z.enum(["text", "placeText", "reportedTimeText", "transcript"]).optional(),
      start: z.number().optional(),
      end: z.number().optional(),
    })
    .optional(),
  mediaId: z.string().optional(),
  hazardCategory: z.string().optional(),
  roadStatus: RoadStatus.optional(),
  roadName: z.string().optional(),
  people: z.object({ kind: PeopleKind, count: z.number().optional() }).optional(),
  place: z
    .object({
      text: z.string(),
      romanized: z.string().optional(),
      kind: z.string().optional(),
      resolved: ResolvedPlace.optional(),
      /** Equally good gazetteer matches far apart: a reviewer must choose. */
      ambiguous: z.boolean().optional(),
      candidates: z.array(ResolvedPlace).optional(),
    })
    .optional(),
  time: z
    .object({
      text: z.string(),
      interpretedStart: z.string().optional(),
      interpretedEnd: z.string().optional(),
    })
    .optional(),
  /** The model's own stated certainty. Not a calibrated probability. */
  modelCertainty: z.enum(["low", "medium", "high"]).optional(),
  review: ReviewDecision,
  editedStatement: z.string().optional(),
  createdAt: z.string(),
});
export type Claim = z.infer<typeof Claim>;

// ---------------------------------------------------------------- Extractions

export const ExtractionStatus = z.enum(["ok", "failed"]);

export const Extraction = z.object({
  id: z.string(),
  reportId: z.string(),
  createdAt: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  status: ExtractionStatus,
  error: z.string().optional(),
  latencyMs: z.number().optional(),
  usage: z.object({ inputTokens: z.number().optional(), outputTokens: z.number().optional() }).optional(),
  detectedLanguage: z.string().optional(),
  translationEn: z.string().optional(),
  transcript: z.object({ mediaId: z.string(), text: z.string(), language: z.string().optional() }).optional(),
  hazardCandidates: z
    .array(z.object({ category: z.string(), rationale: z.string(), basis: z.string() }))
    .default([]),
  missingInformation: z.array(z.string()).default([]),
  uncertaintyNotes: z.array(z.string()).default([]),
  mediaNotes: z
    .array(z.object({ mediaId: z.string(), relevance: z.string(), note: z.string() }))
    .default([]),
  claimIds: z.array(z.string()).default([]),
  validation: z.object({
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
    droppedClaims: z.number(),
    unverifiedExcerpts: z.number(),
    citationsChecked: z.number(),
    citationsRejected: z.number(),
  }),
  /** Raw model output, kept for audit. */
  raw: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  embeddingModel: z.string().optional(),
});
export type Extraction = z.infer<typeof Extraction>;

// ---------------------------------------------------------------- Incidents & matching

export const IncidentStatus = z.enum(["candidate", "under_review", "verified", "dismissed"]);
export type IncidentStatus = z.infer<typeof IncidentStatus>;

export const IncidentMember = z.object({
  reportId: z.string(),
  membership: z.enum(["suggested", "confirmed"]),
  addedBy: z.string(),
  addedAt: z.string(),
  /** Set when this report looks like a copy of another; copies are not independent sources. */
  copyOf: z.string().optional(),
  copyReasons: z.array(z.string()).optional(),
});
export type IncidentMember = z.infer<typeof IncidentMember>;

export const IncidentLocation = z.object({
  lat: z.number(),
  lng: z.number(),
  uncertaintyM: z.number(),
  source: z.enum(["report_gps", "report_pin", "gazetteer", "reviewer"]),
  basisReportId: z.string().optional(),
  label: z.string().optional(),
});
export type IncidentLocation = z.infer<typeof IncidentLocation>;

export const Incident = z.object({
  id: z.string(),
  regionId: z.string(),
  dataLabel: DataLabel,
  title: z.string(),
  hazard: z.object({ category: z.string(), source: z.enum(["ai", "reporter", "reviewer"]) }),
  status: IncidentStatus,
  members: z.array(IncidentMember),
  /** Denormalised member report ids, for array-contains queries. Kept in sync with members. */
  reportIds: z.array(z.string()),
  location: IncidentLocation.optional(),
  firstReportedAt: z.string(),
  lastReportedAt: z.string(),
  independentSources: z.number(),
  openContradictions: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
  verification: z.object({ by: z.string(), byName: z.string(), at: z.string(), note: z.string().optional() }).optional(),
  latestImpactId: z.string().optional(),
  latestAlertId: z.string().optional(),
});
export type Incident = z.infer<typeof Incident>;

export const SuggestionVerdict = z.enum(["likely_same", "possibly_same", "likely_different", "insufficient_information"]);
export type SuggestionVerdict = z.infer<typeof SuggestionVerdict>;

export const Suggestion = z.object({
  id: z.string(),
  regionId: z.string(),
  /** Sorted pair of report ids. */
  reportIds: z.array(z.string()).length(2),
  features: z.object({
    distanceKm: z.number().nullable(),
    effectiveDistanceKm: z.number().nullable(),
    hoursApart: z.number().nullable(),
    hazardMatch: z.enum(["same", "compatible", "different", "unknown"]),
    semanticSimilarity: z.number().nullable(),
    lexicalSimilarity: z.number(),
    sharedMedia: z.boolean(),
    sameReporter: z.boolean(),
    unavailable: z.array(z.string()),
  }),
  score: z.number(),
  copySuspected: z.boolean(),
  copyReasons: z.array(z.string()),
  ai: z
    .object({
      verdict: SuggestionVerdict,
      rationale: z.string(),
      agreements: z.array(z.object({ text: z.string(), claimIds: z.array(z.string()) })),
      conflicts: z.array(z.object({ text: z.string(), claimIds: z.array(z.string()), kind: z.string().optional() })),
      missing: z.array(z.string()),
      copySignals: z.array(z.string()).optional(),
      model: z.string(),
      promptVersion: z.string(),
      citationsRejected: z.number(),
    })
    .optional(),
  status: z.enum(["pending", "accepted", "rejected"]),
  decidedBy: z.string().optional(),
  decidedAt: z.string().optional(),
  createdAt: z.string(),
});
export type Suggestion = z.infer<typeof Suggestion>;

export const ContradictionKind = z.enum([
  "location",
  "time",
  "hazard",
  "road_status",
  "people_count",
  "photo_time",
  "photo_location",
  "semantic",
]);
export type ContradictionKind = z.infer<typeof ContradictionKind>;

export const Contradiction = z.object({
  id: z.string(),
  regionId: z.string(),
  incidentId: z.string().optional(),
  reportIds: z.array(z.string()),
  claimIds: z.array(z.string()),
  kind: ContradictionKind,
  detectedBy: z.enum(["rule", "ai"]),
  description: z.string(),
  fingerprint: z.string(),
  status: z.enum(["open", "resolved", "dismissed"]),
  resolution: z.object({ by: z.string(), byName: z.string(), at: z.string(), note: z.string().optional() }).optional(),
  model: z.string().optional(),
  createdAt: z.string(),
});
export type Contradiction = z.infer<typeof Contradiction>;

// ---------------------------------------------------------------- Impact

export const AccessResultSchema = z.object({
  target: z.enum(["any_health_facility", "hospital"]),
  status: z.enum(["lost", "longer", "unchanged", "not_connected"]),
  beforeM: z.number().nullable(),
  afterM: z.number().nullable(),
  beforeFacilityId: z.string().optional(),
  beforeFacilityName: z.string().optional(),
  afterFacilityId: z.string().optional(),
  afterFacilityName: z.string().optional(),
});

export const ImpactCandidate = z.object({
  id: z.string(),
  key: z.string(),
  kind: z.enum(["road_segment", "settlement_access", "facility_access", "nearby_asset"]),
  finding: z.enum(["possibly_blocked", "lost_access", "longer_route", "catchment_affected", "nearby"]),
  severity: z.number(),
  name: z.string(),
  nameNe: z.string().optional(),
  assetId: z.string().optional(),
  assetKind: z.string().optional(),
  assetSubtype: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  edgeIds: z.array(z.number()).optional(),
  geometry: z.array(z.number()).optional(),
  access: z.array(AccessResultSchema).optional(),
  affectedSettlements: z.array(z.string()).optional(),
  metrics: z.record(z.string(), z.number().nullable()),
  explanation: z.string(),
  caveats: z.array(z.string()),
  reliesOnClaimIds: z.array(z.string()),
  population: z.number().optional(),
  review: ReviewDecision,
});
export type ImpactCandidate = z.infer<typeof ImpactCandidate>;

export const ImpactAssessment = z.object({
  id: z.string(),
  incidentId: z.string(),
  regionId: z.string(),
  version: z.number(),
  createdAt: z.string(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  dataset: z.object({ id: z.string(), name: z.string(), snapshot: z.string(), license: z.string(), attribution: z.string() }).optional(),
  inputs: z.object({
    location: IncidentLocation.optional(),
    blockageClaimIds: z.array(z.string()),
    blockageClaimStatus: z.record(z.string(), z.string()),
    roadNames: z.array(z.string()),
    params: z.record(z.string(), z.number()),
  }),
  status: z.enum(["ok", "outside_dataset", "no_road_nearby", "proximity_only", "no_location", "no_dataset"]),
  statusMessage: z.string(),
  blockedRoads: z.array(z.object({ edge: z.number(), name: z.string(), roadClass: z.string(), distanceM: z.number(), lengthM: z.number() })),
  otherNearbyRoads: z.array(z.object({ edge: z.number(), name: z.string(), roadClass: z.string(), distanceM: z.number() })),
  candidates: z.array(ImpactCandidate),
  stats: z.record(z.string(), z.number()),
  warnings: z.array(z.string()),
  limitations: z.array(z.string()),
  aiExplanation: z
    .object({
      text: z.string(),
      model: z.string(),
      promptVersion: z.string(),
      citedCandidateIds: z.array(z.string()),
      accepted: z.boolean(),
      rejectionReason: z.string().optional(),
    })
    .optional(),
});
export type ImpactAssessment = z.infer<typeof ImpactAssessment>;

// ---------------------------------------------------------------- Alerts

export const Citation = z.object({ type: z.enum(["claim", "impact", "contradiction"]), id: z.string() });
export type Citation = z.infer<typeof Citation>;

export const AlertSentence = z.object({ text: z.string(), textNe: z.string().optional(), citations: z.array(Citation) });
export type AlertSentence = z.infer<typeof AlertSentence>;

export const AlertSection = z.object({
  key: z.enum(["headline", "known", "where_when", "impacts", "unconfirmed"]),
  title: z.string(),
  sentences: z.array(AlertSentence),
});
export type AlertSection = z.infer<typeof AlertSection>;

export const AlertDraft = z.object({
  id: z.string(),
  incidentId: z.string(),
  regionId: z.string(),
  version: z.number(),
  createdAt: z.string(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  model: z.string(),
  promptVersion: z.string(),
  languages: z.array(z.enum(["en", "ne"])),
  sections: z.array(AlertSection),
  sources: z.object({ claimIds: z.array(z.string()), impactCandidateIds: z.array(z.string()), contradictionIds: z.array(z.string()) }),
  validation: z.object({ removedSentences: z.number(), warnings: z.array(z.string()) }),
  status: z.enum(["draft", "approved", "rejected", "superseded"]),
  decision: z.object({ by: z.string(), byName: z.string(), at: z.string(), note: z.string().optional() }).optional(),
});
export type AlertDraft = z.infer<typeof AlertDraft>;

// ---------------------------------------------------------------- Audit trail

export const AuditTarget = z.enum(["report", "claim", "extraction", "incident", "suggestion", "contradiction", "impact", "alert", "session"]);

export const AuditEvent = z.object({
  id: z.string(),
  at: z.string(),
  actor: Actor,
  action: z.string(),
  targetType: AuditTarget,
  targetId: z.string(),
  incidentId: z.string().optional(),
  reportId: z.string().optional(),
  summary: z.string(),
  note: z.string().optional(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;
