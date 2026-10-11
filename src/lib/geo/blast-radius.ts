// Blast Radius Analysis: which places, roads and services may be affected by an incident.
//
// Deterministic. Uses only the regional dataset (OpenStreetMap extract) and the inputs given.
// It never predicts hazard extents, damage or casualties, and it never marks anything as safe.

import type { Asset, AssetKind, DatasetManifest } from "./dataset-types";
import { pathToSource, roadClassRank, shortestPaths, type RoadGraph, type ShortestPaths } from "./graph";
import { bboxContains, formatKm, haversineM, simplifyPolyline } from "./math";

export interface BlastRadiusParams {
  /** Straight-line radius for listing nearby assets (added to the location uncertainty, capped). */
  nearbyRadiusM: number;
  /** Minimum search radius for a road segment near the incident. */
  blockSearchRadiusM: number;
  /** Maximum search radius, even when the location is very uncertain. */
  maxBlockSearchRadiusM: number;
  /** If no road is inside the search radius, the nearest road within this distance is used (with a warning). */
  maxNearestRoadM: number;
  /** A route counts as "longer" when it grows by this factor and by at least longerRouteMinExtraM. */
  longerRouteFactor: number;
  longerRouteMinExtraM: number;
  /** Assets further than this from the nearest mapped road get a data-quality caveat. */
  weakSnapM: number;
  /** Baseline routes drawn on the map for at most this many places. */
  maxRoutes: number;
}

export const DEFAULT_BLAST_RADIUS_PARAMS: BlastRadiusParams = {
  nearbyRadiusM: 2000,
  blockSearchRadiusM: 150,
  maxBlockSearchRadiusM: 1000,
  maxNearestRoadM: 1000,
  longerRouteFactor: 1.5,
  longerRouteMinExtraM: 2000,
  weakSnapM: 500,
  maxRoutes: 12,
};

export interface BlockageInput {
  /** Claims that describe a road blockage. */
  claimIds: string[];
  /** Review status for each claim, used to word explanations honestly. */
  claimStatus: Record<string, string>;
  /** Road names mentioned in those claims, used to pick the right road near the location. */
  roadNames: string[];
}

export interface BlastRadiusInput {
  graph: RoadGraph;
  assets: Asset[];
  manifest: DatasetManifest;
  incident: { lat: number; lng: number; uncertaintyM: number };
  blockage: BlockageInput | null;
  params?: Partial<BlastRadiusParams>;
}

export type AccessTarget = "any_health_facility" | "hospital";

export interface AccessResult {
  target: AccessTarget;
  status: "lost" | "longer" | "unchanged" | "not_connected";
  beforeM: number | null;
  afterM: number | null;
  beforeFacilityId?: string;
  beforeFacilityName?: string;
  afterFacilityId?: string;
  afterFacilityName?: string;
}

export type CandidateKind = "road_segment" | "settlement_access" | "facility_access" | "nearby_asset";
export type CandidateFinding = "possibly_blocked" | "lost_access" | "longer_route" | "catchment_affected" | "nearby";

export interface ComputedCandidate {
  /** Deterministic key, stable across re-runs with the same inputs. */
  key: string;
  kind: CandidateKind;
  finding: CandidateFinding;
  severity: number;
  name: string;
  nameNe?: string;
  assetId?: string;
  assetKind?: AssetKind;
  assetSubtype?: string;
  lat: number;
  lng: number;
  edgeIds?: number[];
  /** Flat [lat, lng, ...] polyline: the road segment, or the baseline route for an access candidate. */
  geometry?: number[];
  access?: AccessResult[];
  affectedSettlements?: string[];
  metrics: Record<string, number | null>;
  explanation: string;
  caveats: string[];
  reliesOnClaimIds: string[];
  population?: number;
}

export interface BlastRadiusResult {
  status: "ok" | "outside_dataset" | "no_road_nearby" | "proximity_only";
  statusMessage: string;
  blockedEdges: Array<{ edge: number; name: string; roadClass: string; distanceM: number; lengthM: number; geometry: number[] }>;
  otherNearbyRoads: Array<{ edge: number; name: string; roadClass: string; distanceM: number }>;
  candidates: ComputedCandidate[];
  stats: {
    settlementsAnalysed: number;
    notConnectedBefore: number;
    lostAccessAny: number;
    lostAccessHospitalOnly: number;
    longerRouteAny: number;
    longerRouteHospital: number;
    facilitiesAffected: number;
    nearbyAssets: number;
    populationTaggedPlaces: number;
    populationTaggedTotal: number;
  };
  warnings: string[];
  params: BlastRadiusParams;
}

const SUBTYPE_LABEL: Record<string, string> = {
  hospital: "hospital",
  health_centre: "health centre",
  health_post: "health post",
  clinic: "clinic",
  school: "school",
  town: "town",
  village: "village",
  hamlet: "hamlet",
  suburb: "neighbourhood",
  neighbourhood: "neighbourhood",
  isolated_dwelling: "dwelling",
  city: "city",
};

export function subtypeLabel(subtype: string): string {
  return SUBTYPE_LABEL[subtype] ?? subtype.replace(/_/g, " ");
}

function normaliseRoadName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(highway|rajmarg|road|marg|sadak|route)\b/g, " ")
    .replace(/[^a-z0-9ऀ-ॿ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** True when a mentioned road name plausibly refers to the mapped road name (e.g. "Arniko" ≈ "Araniko"). */
export function roadNamesMatch(mentioned: string, mapped: string): boolean {
  const a = normaliseRoadName(mentioned);
  const b = normaliseRoadName(mapped);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  return a.split(" ").some((ta) =>
    b.split(" ").some((tb) => ta.length >= 5 && tb.length >= 5 && editDistance(ta, tb) <= 2),
  );
}

function claimStatusPhrase(blockage: BlockageInput): string {
  const statuses = blockage.claimIds.map((id) => blockage.claimStatus[id] ?? "unreviewed");
  const confirmed = statuses.filter((s) => s === "confirmed" || s === "edited").length;
  const unreviewed = statuses.length - confirmed;
  const parts: string[] = [];
  if (confirmed) parts.push(`${confirmed} confirmed by a reviewer`);
  if (unreviewed) parts.push(`${unreviewed} not yet confirmed`);
  return parts.join(", ");
}

function emptyStats(): BlastRadiusResult["stats"] {
  return {
    settlementsAnalysed: 0,
    notConnectedBefore: 0,
    lostAccessAny: 0,
    lostAccessHospitalOnly: 0,
    longerRouteAny: 0,
    longerRouteHospital: 0,
    facilitiesAffected: 0,
    nearbyAssets: 0,
    populationTaggedPlaces: 0,
    populationTaggedTotal: 0,
  };
}

function classifyAccess(
  target: AccessTarget,
  before: ShortestPaths,
  after: ShortestPaths,
  node: number,
  sources: Asset[],
  p: BlastRadiusParams,
): AccessResult {
  const b = before.dist[node];
  const a = after.dist[node];
  if (!Number.isFinite(b)) return { target, status: "not_connected", beforeM: null, afterM: null };
  const bf = sources[before.nearestSource[node]];
  const base = { target, beforeM: Math.round(b), beforeFacilityId: bf?.id, beforeFacilityName: bf?.name };
  if (!Number.isFinite(a)) return { ...base, status: "lost", afterM: null };
  const af = sources[after.nearestSource[node]];
  const longer = a > b * p.longerRouteFactor && a - b >= p.longerRouteMinExtraM;
  return {
    ...base,
    status: longer ? "longer" : "unchanged",
    afterM: Math.round(a),
    afterFacilityId: af?.id,
    afterFacilityName: af?.name,
  };
}

function describeRoute(place: string, what: string, r: AccessResult): string {
  const extra = formatKm(r.afterM! - r.beforeM!);
  if (r.afterFacilityId === r.beforeFacilityId) {
    return `The road route from ${place} to its nearest ${what}, ${r.beforeFacilityName}, grows from ${formatKm(r.beforeM!)} to ${formatKm(r.afterM!)} (${extra} longer) because it must avoid the blocked segment.`;
  }
  return `The nearest ${what} that ${place} can reach by road changes from ${r.beforeFacilityName} (${formatKm(r.beforeM!)}) to ${r.afterFacilityName} (${formatKm(r.afterM!)}), ${extra} further.`;
}

/** Deterministic, plain-language explanation of one settlement's access change. */
function describeAccess(place: string, road: string, any: AccessResult, hosp: AccessResult): string[] {
  const sentences: string[] = [];
  const sameAsHospital =
    hosp.beforeFacilityId === any.beforeFacilityId && hosp.status === any.status && hosp.afterFacilityId === any.afterFacilityId;
  if (any.status === "lost") {
    sentences.push(
      `On the mapped road network, the nearest health facility for ${place} is ${any.beforeFacilityName} (${formatKm(any.beforeM!)} by road). With the segment of ${road} near the reported location blocked, no mapped road route to any health facility remains.`,
    );
  } else if (any.status === "longer") {
    sentences.push(describeRoute(place, "health facility", any));
  }
  if (sameAsHospital && any.status !== "unchanged") {
    sentences.push("This facility is also the nearest hospital.");
  } else if (hosp.status === "lost" && any.status !== "lost") {
    sentences.push(
      `${place} can still reach a health facility by road, but loses its mapped road route to any hospital (previously ${hosp.beforeFacilityName}, ${formatKm(hosp.beforeM!)}).`,
    );
  } else if (hosp.status === "longer") {
    sentences.push(describeRoute(place, "hospital", hosp));
  }
  return sentences;
}

export function analyzeBlastRadius(input: BlastRadiusInput): BlastRadiusResult {
  const p: BlastRadiusParams = { ...DEFAULT_BLAST_RADIUS_PARAMS, ...input.params };
  const { graph, assets, manifest, incident, blockage } = input;
  const warnings: string[] = [];
  const stats = emptyStats();
  const notSafe = "Places outside this analysis are not necessarily safe.";

  if (!bboxContains(manifest.bbox, incident.lat, incident.lng)) {
    return {
      status: "outside_dataset",
      statusMessage: `The incident location is outside the loaded dataset (${manifest.name}). No analysis was run. This does not mean the area is unaffected.`,
      blockedEdges: [],
      otherNearbyRoads: [],
      candidates: [],
      stats,
      warnings: [notSafe],
      params: p,
    };
  }

  const candidates: ComputedCandidate[] = [];
  const uncertainty = Math.max(0, incident.uncertaintyM);

  // 1. Road segment possibly blocked — only when a claim describes a blockage.
  let blockedEdges: BlastRadiusResult["blockedEdges"] = [];
  let otherNearbyRoads: BlastRadiusResult["otherNearbyRoads"] = [];
  let status: BlastRadiusResult["status"] = "proximity_only";
  let statusMessage = "No claim describes a road blockage, so road access was not analysed. Only nearby assets are listed.";

  if (blockage && blockage.claimIds.length > 0) {
    const searchM = Math.min(Math.max(uncertainty, p.blockSearchRadiusM), p.maxBlockSearchRadiusM);
    let hits = graph.edgesNear(incident.lat, incident.lng, searchM);
    if (hits.length === 0) {
      hits = graph.edgesNear(incident.lat, incident.lng, p.maxNearestRoadM).slice(0, 1);
      if (hits.length) {
        warnings.push(
          `No mapped road lies within ${formatKm(searchM)} of the reported location. The nearest mapped road, ${formatKm(hits[0].distanceM)} away, is used instead.`,
        );
      }
    }
    if (hits.length === 0) {
      status = "no_road_nearby";
      statusMessage = `A road blockage is reported, but no mapped road lies within ${formatKm(p.maxNearestRoadM)} of the location. The road may be missing from OpenStreetMap, or the location may be wrong.`;
    } else {
      const named = hits.filter((h) => {
        const name = graph.edgeName(h.edge);
        return name ? blockage.roadNames.some((m) => roadNamesMatch(m, name)) : false;
      });
      let pool = named.length ? named : hits;
      const bestRank = Math.min(...pool.map((h) => roadClassRank(graph.edgeClassName(h.edge))));
      pool = pool.filter((h) => roadClassRank(graph.edgeClassName(h.edge)) === bestRank);
      const chosen = pool[0];
      if (blockage.roadNames.length && !named.length) {
        warnings.push(
          `The road named in the report (${blockage.roadNames.join(", ")}) was not matched to a mapped road nearby. The most important road near the location was used.`,
        );
      }
      if (hits.length > 1) {
        warnings.push(
          "The analysis assumes one blocked segment at the nearest point of the selected road. Other roads near the location are listed but not assumed blocked.",
        );
      }
      blockedEdges = [
        {
          edge: chosen.edge,
          name: graph.edgeLabel(chosen.edge),
          roadClass: graph.edgeClassName(chosen.edge),
          distanceM: Math.round(chosen.distanceM),
          lengthM: Math.round(graph.edgeLength[chosen.edge]),
          geometry: graph.edgeCoords(chosen.edge),
        },
      ];
      const seenNames = new Set([graph.edgeLabel(chosen.edge)]);
      otherNearbyRoads = hits
        .filter((h) => h.edge !== chosen.edge)
        .filter((h) => {
          const label = graph.edgeLabel(h.edge);
          if (seenNames.has(label)) return false;
          seenNames.add(label);
          return true;
        })
        .slice(0, 5)
        .map((h) => ({
          edge: h.edge,
          name: graph.edgeLabel(h.edge),
          roadClass: graph.edgeClassName(h.edge),
          distanceM: Math.round(h.distanceM),
        }));
      status = "ok";
      statusMessage = `Road access was analysed with one segment of ${blockedEdges[0].name} treated as possibly blocked.`;

      const statusPhrase = claimStatusPhrase(blockage);
      const segmentCaveats = [`Relies on ${blockage.claimIds.length} road-blockage claim(s): ${statusPhrase}.`];
      candidates.push({
        key: `road:${chosen.edge}`,
        kind: "road_segment",
        finding: "possibly_blocked",
        severity: 5,
        name: blockedEdges[0].name,
        lat: chosen.lat,
        lng: chosen.lng,
        edgeIds: [chosen.edge],
        geometry: blockedEdges[0].geometry,
        metrics: { distanceToIncidentM: blockedEdges[0].distanceM, segmentLengthM: blockedEdges[0].lengthM },
        explanation: `${blockedEdges[0].name} passes ${formatKm(chosen.distanceM)} from the reported location. It is treated as possibly blocked because ${blockage.claimIds.length === 1 ? "a claim describes" : `${blockage.claimIds.length} claims describe`} a road blockage (${statusPhrase}).`,
        caveats: segmentCaveats,
        reliesOnClaimIds: blockage.claimIds,
      });
    }
  }

  // 2. Access to health services before and after the candidate blockage.
  const affectedKeysByFacility = new Map<string, { facility: Asset; settlements: string[]; target: AccessTarget }>();
  if (status === "ok") {
    const health = assets.filter((a) => a.kind === "health_facility" && a.node >= 0);
    const hospitals = health.filter((a) => a.subtype === "hospital");
    const blocked = new Set(blockedEdges.map((b) => b.edge));
    const beforeAny = shortestPaths(graph, health.map((h) => h.node));
    const afterAny = shortestPaths(graph, health.map((h) => h.node), blocked);
    const beforeHosp = shortestPaths(graph, hospitals.map((h) => h.node));
    const afterHosp = shortestPaths(graph, hospitals.map((h) => h.node), blocked);
    const relies = blockage!.claimIds;
    const unconfirmed = relies.some((id) => !["confirmed", "edited"].includes(blockage!.claimStatus[id] ?? ""));
    let routesDrawn = 0;

    const settlements = assets.filter((a) => a.kind === "settlement");
    for (const s of settlements) {
      if (s.node < 0) continue;
      stats.settlementsAnalysed++;
      const any = classifyAccess("any_health_facility", beforeAny, afterAny, s.node, health, p);
      const hosp = classifyAccess("hospital", beforeHosp, afterHosp, s.node, hospitals, p);
      if (any.status === "not_connected") {
        stats.notConnectedBefore++;
        continue;
      }
      const affected = [any, hosp].filter((r) => r.status === "lost" || r.status === "longer");
      if (!affected.length) continue;

      const lostAny = any.status === "lost";
      const lostHospOnly = !lostAny && hosp.status === "lost";
      if (lostAny) stats.lostAccessAny++;
      else if (lostHospOnly) stats.lostAccessHospitalOnly++;
      if (any.status === "longer") stats.longerRouteAny++;
      if (hosp.status === "longer") stats.longerRouteHospital++;
      if (s.population) {
        stats.populationTaggedPlaces++;
        stats.populationTaggedTotal += s.population;
      }

      const sentences = describeAccess(s.name, blockedEdges[0].name, any, hosp);

      const caveats: string[] = [];
      if (s.snapM > p.weakSnapM)
        caveats.push(`The place point is ${formatKm(s.snapM)} from the nearest mapped road, so its road link is uncertain.`);
      if (unconfirmed) caveats.push("Relies on a road-blockage claim that a reviewer has not confirmed.");
      caveats.push("Footpaths are not in the network; people may still reach services on foot.");

      let geometry: number[] | undefined;
      if (lostAny && routesDrawn < p.maxRoutes) {
        const route = graph.pathCoords(pathToSource(graph, beforeAny, s.node));
        geometry = simplifyPolyline(route, 15);
        routesDrawn++;
      }

      const key = `settlement:${s.id}`;
      candidates.push({
        key,
        kind: "settlement_access",
        finding: lostAny || lostHospOnly ? "lost_access" : "longer_route",
        severity: lostAny ? 4 : lostHospOnly ? 3 : any.status === "longer" ? 2.5 : 2,
        name: s.name,
        nameNe: s.nameNe,
        assetId: s.id,
        assetKind: s.kind,
        assetSubtype: s.subtype,
        lat: s.lat,
        lng: s.lng,
        geometry,
        access: [any, hosp],
        metrics: {
          beforeM: any.beforeM,
          afterM: any.afterM,
          hospitalBeforeM: hosp.beforeM,
          hospitalAfterM: hosp.afterM,
          snapM: s.snapM,
          distanceToIncidentM: Math.round(haversineM(incident.lat, incident.lng, s.lat, s.lng)),
        },
        explanation: sentences.join(" "),
        caveats,
        reliesOnClaimIds: relies,
        population: s.population,
      });

      for (const r of affected) {
        if (!r.beforeFacilityId) continue;
        const facility = assets.find((a) => a.id === r.beforeFacilityId);
        if (!facility) continue;
        const entry = affectedKeysByFacility.get(facility.id) ?? { facility, settlements: [], target: r.target };
        if (!entry.settlements.includes(s.name)) entry.settlements.push(s.name);
        affectedKeysByFacility.set(facility.id, entry);
      }
    }

    for (const { facility, settlements: names } of affectedKeysByFacility.values()) {
      stats.facilitiesAffected++;
      const listed = names.slice(0, 6).join(", ") + (names.length > 6 ? `, and ${names.length - 6} more` : "");
      candidates.push({
        key: `facility:${facility.id}`,
        kind: "facility_access",
        finding: "catchment_affected",
        severity: 1.5,
        name: facility.name,
        nameNe: facility.nameNe,
        assetId: facility.id,
        assetKind: facility.kind,
        assetSubtype: facility.subtype,
        lat: facility.lat,
        lng: facility.lng,
        affectedSettlements: names,
        metrics: { settlementsAffected: names.length, distanceToIncidentM: Math.round(haversineM(incident.lat, incident.lng, facility.lat, facility.lng)) },
        explanation: `${names.length} place(s) whose nearest ${subtypeLabel(facility.subtype)} by road was ${facility.name} may lose or lengthen their road access to it: ${listed}.`,
        caveats: facility.name.includes("unnamed") ? ["The facility is unnamed in OpenStreetMap."] : [],
        reliesOnClaimIds: blockage!.claimIds,
      });
    }

    if (stats.notConnectedBefore > 0) {
      warnings.push(
        `${stats.notConnectedBefore} settlement(s) in the dataset have no mapped road route to any health facility even before this incident (missing roads or genuinely isolated places). They are not counted as affected.`,
      );
    }
    if (stats.lostAccessAny > 0) {
      warnings.push(
        "\"No route\" means no route in the mapped data. A health facility or road missing from OpenStreetMap would change this result.",
      );
    }
  }

  // 3. Nearby assets (straight-line distance only).
  const listed = new Set(candidates.map((c) => c.assetId).filter(Boolean));
  const nearbyRadius = p.nearbyRadiusM + Math.min(uncertainty, 2000);
  const nearby = assets
    .map((a) => ({ a, d: haversineM(incident.lat, incident.lng, a.lat, a.lng) }))
    .filter(({ a, d }) => d <= nearbyRadius && !listed.has(a.id))
    .sort((x, y) => x.d - y.d || x.a.id.localeCompare(y.a.id))
    .slice(0, 25);
  for (const { a, d } of nearby) {
    stats.nearbyAssets++;
    candidates.push({
      key: `nearby:${a.id}`,
      kind: "nearby_asset",
      finding: "nearby",
      severity: 1,
      name: a.name,
      nameNe: a.nameNe,
      assetId: a.id,
      assetKind: a.kind,
      assetSubtype: a.subtype,
      lat: a.lat,
      lng: a.lng,
      metrics: { distanceToIncidentM: Math.round(d) },
      explanation: `${a.name} (${subtypeLabel(a.subtype)}) is ${formatKm(d)} in a straight line from the reported location. Being nearby does not mean it is affected.`,
      caveats: uncertainty > 500 ? [`The incident location is uncertain by about ${formatKm(uncertainty)}.`] : [],
      reliesOnClaimIds: [],
      population: a.population,
    });
  }

  warnings.push(notSafe);
  candidates.sort((x, y) => y.severity - x.severity || (x.metrics.distanceToIncidentM ?? 0) - (y.metrics.distanceToIncidentM ?? 0) || x.key.localeCompare(y.key));
  return { status, statusMessage, blockedEdges, otherNearbyRoads, candidates, stats, warnings, params: p };
}
