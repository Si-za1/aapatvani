// File formats for the pre-processed regional datasets in data/regions/.
// Produced offline by scripts/prepare-region.ts, read at runtime by lib/geo/dataset.ts.

import type { BBox } from "./math";

export interface DatasetManifest {
  id: string;
  regionId: string;
  name: string;
  nameNe?: string;
  bbox: BBox;
  /** OSM base timestamp reported by Overpass for the extract. */
  snapshot: string;
  preparedAt: string;
  source: string;
  license: string;
  attribution: string;
  /** Overpass query used for the extract, relative to the repo root. */
  query: string;
  includedRoadClasses: string[];
  stats: {
    nodes: number;
    edges: number;
    roadKm: number;
    components: number;
    largestComponentShare: number;
    healthFacilities: number;
    hospitals: number;
    schools: number;
    settlements: number;
    gazetteerEntries: number;
    excludedCrossBorder: number;
  };
  knownLimitations: string[];
}

/**
 * Road graph. Undirected. Edge ids are array indexes.
 * edges[i] = [fromNode, toNode, lengthM, classIndex, nameIndex (-1 if unnamed), osmWayId, geometryOffset, geometryCount]
 * geometry holds every edge's polyline as flat lat,lng pairs; an edge's points start at geometryOffset.
 */
export interface RoadNetworkFile {
  datasetId: string;
  nodes: number[];
  edges: number[][];
  geometry: number[];
  classes: string[];
  names: string[];
}

export type AssetKind = "health_facility" | "school" | "settlement";

export interface Asset {
  id: string;
  kind: AssetKind;
  /** health: hospital | health_centre | health_post | clinic · settlement: town | village | hamlet | suburb | neighbourhood | isolated_dwelling · school */
  subtype: string;
  name: string;
  nameNe?: string;
  lat: number;
  lng: number;
  /** Nearest road-graph node, or -1 when no road is within reach. */
  node: number;
  /** Straight-line distance from the asset to that node, in metres. */
  snapM: number;
  /** Population from the OSM tag, when one exists. Never estimated. */
  population?: number;
  osm: string;
}

export interface AssetsFile {
  datasetId: string;
  assets: Asset[];
}

export interface GazetteerEntry {
  id: string;
  name: string;
  nameNe?: string;
  alt: string[];
  kind: string;
  lat: number;
  lng: number;
  /** How far the named place may extend from its point, in metres. */
  uncertaintyM: number;
  source: string;
}

export interface GazetteerFile {
  datasetId: string;
  entries: GazetteerEntry[];
}
