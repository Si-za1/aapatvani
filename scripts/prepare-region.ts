/**
 * Builds the offline regional dataset used by Blast Radius Analysis.
 *
 *   npx tsx scripts/prepare-region.ts --fetch               # download from Overpass, then build
 *   npx tsx scripts/prepare-region.ts --input raw.json      # build from a saved Overpass response
 *
 * Output (data/regions/nepal/araniko-corridor/):
 *   dataset.json    manifest: source, licence, snapshot time, stats, known limitations
 *   network.json    undirected road graph with edge geometry
 *   assets.json     health facilities, schools and settlements snapped to the graph
 *   gazetteer.json  English and Nepali place names for resolving place mentions
 *   SOURCE.md       licence, attribution and how to regenerate
 *
 * Deterministic: the same Overpass response always produces the same graph, assets and gazetteer
 * (dataset.json additionally records when the files were prepared).
 * Data © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  bboxContains,
  haversineM,
  polylineLengthM,
  roundCoord,
  simplifyPolyline,
  type BBox,
} from "../src/lib/geo/math";
import type {
  Asset,
  AssetsFile,
  DatasetManifest,
  GazetteerEntry,
  GazetteerFile,
  RoadNetworkFile,
} from "../src/lib/geo/dataset-types";

const CONFIG = {
  id: "np-araniko-corridor",
  regionId: "np",
  name: "Araniko Highway corridor, Sindhupalchok",
  nameNe: "अरनिको राजमार्ग क्षेत्र, सिन्धुपाल्चोक",
  bbox: [27.62, 85.68, 28.0, 86.02] as BBox,
  query: "scripts/overpass/np-araniko-corridor.overpassql",
  outDir: "data/regions/nepal/araniko-corridor",
  overpassEndpoint: "https://overpass-api.de/api/interpreter",
  /** Long road segments are split so assets can snap close to where they are. */
  maxEdgeM: 250,
  simplifyToleranceM: 4,
  /** Assets further than this from any mapped road are kept but not connected. */
  maxSnapM: 3000,
};

const ROAD_CLASSES =
  /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track|road)(_link)?$/;
const CJK = /[㐀-鿿豈-﫿]/;
const SETTLEMENT_PLACES = new Set([
  "city",
  "town",
  "village",
  "hamlet",
  "suburb",
  "neighbourhood",
  "isolated_dwelling",
]);
const PLACE_UNCERTAINTY_M: Record<string, number> = {
  city: 3000,
  town: 1500,
  village: 1200,
  suburb: 800,
  locality: 800,
  hamlet: 500,
  neighbourhood: 400,
  isolated_dwelling: 200,
};

type Tags = Record<string, string>;
type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Tags;
  center?: { lat: number; lon: number };
};
type OverpassResponse = { osm3s?: { timestamp_osm_base?: string }; elements: OsmElement[] };

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return { input: get("--input"), fetch: args.includes("--fetch"), out: get("--out") ?? CONFIG.outDir };
}

async function fetchOverpass(): Promise<OverpassResponse> {
  const query = readFileSync(CONFIG.query, "utf8");
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(CONFIG.overpassEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "AapatVani-prototype/0.1 (regional data preparation)",
      },
      body: new URLSearchParams({ data: query }),
    });
    const text = await res.text();
    if (res.ok && text.trimStart().startsWith("{")) return JSON.parse(text) as OverpassResponse;
    console.warn(`Overpass attempt ${attempt} failed (${res.status}); retrying in 30 s`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
  throw new Error("Overpass did not return data after 6 attempts");
}

/** Places and roads on the far side of the border (Chinese names, G-routes) are excluded. */
function isCrossBorder(tags: Tags): boolean {
  if (tags.ref && /^G\d+/.test(tags.ref)) return true;
  const name = tags.name ?? "";
  return CJK.test(name) && !tags["name:ne"] && !(tags.ref && /^(NH|H)\d+/.test(tags.ref));
}

function displayName(tags: Tags): { name?: string; nameNe?: string; alt: string[] } {
  const nameNe = tags["name:ne"] ?? (/[ऀ-ॿ]/.test(tags.name ?? "") ? tags.name : undefined);
  const latin = [tags["name:en"], tags.name, tags["int_name"]].find(
    (n) => n && !/[ऀ-ॿ]/.test(n) && !CJK.test(n),
  );
  const name = latin ?? nameNe ?? tags.name;
  const alt = [tags.alt_name, tags.old_name, tags["name:en"], tags.name, tags["alt_name:ne"]]
    .flatMap((v) => (v ? v.split(";") : []))
    .map((v) => v.trim())
    .filter((v) => v && v !== name && v !== nameNe);
  return { name, nameNe, alt: Array.from(new Set(alt)) };
}

function healthLevel(tags: Tags, name: string | undefined): string {
  const n = (name ?? "").toLowerCase();
  // "swasthya chauki" (स्वास्थ्य चौकी) is the Nepali term for a health post.
  if (/\b(shp|sub[- ]?health ?post|health ?post|hp)\b|swasthy?a? ?chauki|स्वास्थ्य चौकी/.test(n)) return "health_post";
  if (/eye|dental|midwife|birthing/.test(n)) return "clinic";
  if (/health (center|centre)|phcc?|community health|basic health|health unit|health service|health facility|delivery/.test(n))
    return "health_centre";
  if (/hospital/.test(n)) return "hospital";
  if (tags.amenity === "hospital" || tags.healthcare === "hospital") return "hospital";
  if (tags.amenity === "health_post") return "health_post";
  return "clinic";
}

function build(raw: OverpassResponse) {
  const snapshot = raw.osm3s?.timestamp_osm_base ?? "unknown";
  const coords = new Map<number, [number, number]>();
  for (const el of raw.elements) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) coords.set(el.id, [el.lat, el.lon]);
  }

  let excludedCrossBorder = 0;
  const roads = raw.elements.filter((el) => {
    if (el.type !== "way" || !el.tags?.highway || !ROAD_CLASSES.test(el.tags.highway)) return false;
    if (el.tags.area === "yes" || el.tags.service === "parking_aisle") return false;
    if (isCrossBorder(el.tags)) {
      excludedCrossBorder++;
      return false;
    }
    return (el.nodes?.length ?? 0) >= 2;
  });

  // Nodes shared by two or more ways (or repeated within a way) become graph nodes.
  const useCount = new Map<number, number>();
  for (const way of roads) for (const id of way.nodes!) useCount.set(id, (useCount.get(id) ?? 0) + 1);

  const classes: string[] = [];
  const names: string[] = [];
  const classIndex = (c: string) => (classes.includes(c) ? classes.indexOf(c) : classes.push(c) - 1);
  const nameIndex = (n?: string) => (!n ? -1 : names.includes(n) ? names.indexOf(n) : names.push(n) - 1);

  const nodeIndex = new Map<number, number>();
  const nodes: number[] = [];
  const graphNode = (osmId: number) => {
    let idx = nodeIndex.get(osmId);
    if (idx === undefined) {
      const [lat, lng] = coords.get(osmId)!;
      idx = nodes.length / 2;
      nodes.push(roundCoord(lat), roundCoord(lng));
      nodeIndex.set(osmId, idx);
    }
    return idx;
  };

  const edges: number[][] = [];
  const geometry: number[] = [];
  let roadM = 0;

  // Many highway ways carry only a ref (e.g. "NH34"); borrow the name used by other ways with the same ref.
  const refName = new Map<string, string>();
  for (const way of roads) {
    const { ref, name } = way.tags!;
    const latin = name ?? way.tags!["name:en"];
    if (ref && latin && !refName.has(ref)) refName.set(ref, latin);
  }
  const roadLabel = (tags: Tags) => {
    const name = tags.name ?? tags["name:en"] ?? (tags.ref ? refName.get(tags.ref) : undefined);
    if (name && tags.ref && !name.includes(tags.ref)) return `${name} (${tags.ref})`;
    return name ?? tags.ref;
  };

  for (const way of roads) {
    const ids = way.nodes!.filter((id) => coords.has(id));
    if (ids.length < 2) continue;
    const tags = way.tags!;
    const cls = classIndex(tags.highway);
    const label = roadLabel(tags);
    const nm = nameIndex(label);
    let start = 0;
    let runM = 0;
    for (let i = 1; i < ids.length; i++) {
      const [aLat, aLng] = coords.get(ids[i - 1])!;
      const [bLat, bLng] = coords.get(ids[i])!;
      runM += haversineM(aLat, aLng, bLat, bLng);
      const isLast = i === ids.length - 1;
      const isJunction = (useCount.get(ids[i]) ?? 0) >= 2;
      if (!isLast && !isJunction && runM < CONFIG.maxEdgeM) continue;
      const from = graphNode(ids[start]);
      const to = graphNode(ids[i]);
      if (from !== to) {
        const full: number[] = [];
        for (let k = start; k <= i; k++) full.push(...coords.get(ids[k])!);
        const lengthM = polylineLengthM(full);
        const simple = simplifyPolyline(full, CONFIG.simplifyToleranceM).map((v) => roundCoord(v));
        edges.push([from, to, Math.round(lengthM), cls, nm, way.id, geometry.length / 2, simple.length / 2]);
        geometry.push(...simple);
        roadM += lengthM;
      }
      start = i;
      runM = 0;
    }
  }

  // Connected components (union–find).
  const nodeCount = nodes.length / 2;
  const parent = Int32Array.from({ length: nodeCount }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (const [a, b] of edges) parent[find(a)] = find(b);
  const componentSize = new Map<number, number>();
  for (let i = 0; i < nodeCount; i++) componentSize.set(find(i), (componentSize.get(find(i)) ?? 0) + 1);
  const largest = Math.max(...componentSize.values());

  const nearestNode = (lat: number, lng: number) => {
    let best = -1;
    let bestM = Infinity;
    for (let i = 0; i < nodeCount; i++) {
      const dLat = Math.abs(nodes[i * 2] - lat);
      if (dLat > 0.03) continue; // ~3.3 km: cheap pre-filter before haversine
      const m = haversineM(lat, lng, nodes[i * 2], nodes[i * 2 + 1]);
      if (m < bestM) {
        bestM = m;
        best = i;
      }
    }
    return bestM <= CONFIG.maxSnapM ? { node: best, snapM: Math.round(bestM) } : { node: -1, snapM: -1 };
  };

  const pointOf = (el: OsmElement) =>
    el.lat !== undefined ? { lat: el.lat, lng: el.lon! } : el.center ? { lat: el.center.lat, lng: el.center.lon } : null;

  const assets: Asset[] = [];
  const gazetteer: GazetteerEntry[] = [];
  const seen = new Set<string>();

  for (const el of raw.elements) {
    const tags = el.tags;
    if (!tags || tags.highway) continue;
    const p = pointOf(el);
    // Way centres can fall just outside the query box; keep the dataset inside its stated bbox.
    if (!p || !bboxContains(CONFIG.bbox, p.lat, p.lng)) continue;
    const osm = `${el.type}/${el.id}`;
    if (seen.has(osm)) continue;
    if (isCrossBorder(tags)) {
      excludedCrossBorder++;
      continue;
    }
    const { name, nameNe, alt } = displayName(tags);
    const isHealth =
      ["hospital", "clinic", "doctors", "health_post"].includes(tags.amenity ?? "") || Boolean(tags.healthcare);
    const isSchool = tags.amenity === "school";
    const place = tags.place;

    let kind: Asset["kind"] | null = null;
    let subtype = "";
    if (isHealth) {
      kind = "health_facility";
      subtype = healthLevel(tags, name);
    } else if (isSchool) {
      kind = "school";
      subtype = "school";
    } else if (place && SETTLEMENT_PLACES.has(place) && name) {
      kind = "settlement";
      subtype = place;
    }

    if (kind) {
      seen.add(osm);
      const snap = nearestNode(p.lat, p.lng);
      const population = tags.population ? Number.parseInt(tags.population.replace(/[^0-9]/g, ""), 10) : undefined;
      assets.push({
        id: `osm:${osm}`,
        kind,
        subtype,
        name:
          name ??
          (kind === "health_facility" ? "Health facility (unnamed in OSM)" : kind === "school" ? "School (unnamed in OSM)" : "Unnamed place"),
        ...(nameNe ? { nameNe } : {}),
        lat: roundCoord(p.lat),
        lng: roundCoord(p.lng),
        node: snap.node,
        snapM: snap.snapM,
        ...(population && Number.isFinite(population) ? { population } : {}),
        osm,
      });
    }

    if (name || nameNe) {
      const uncertaintyM = place ? (PLACE_UNCERTAINTY_M[place] ?? 800) : 150;
      gazetteer.push({
        id: `osm:${osm}`,
        name: name ?? nameNe!,
        ...(nameNe ? { nameNe } : {}),
        alt,
        kind: place ?? (isHealth ? "health_facility" : isSchool ? "school" : "landmark"),
        lat: roundCoord(p.lat),
        lng: roundCoord(p.lng),
        uncertaintyM,
        source: `OpenStreetMap ${osm}`,
      });
    }
  }

  assets.sort((a, b) => a.id.localeCompare(b.id));
  gazetteer.sort((a, b) => a.id.localeCompare(b.id));

  const health = assets.filter((a) => a.kind === "health_facility");
  const manifest: DatasetManifest = {
    id: CONFIG.id,
    regionId: CONFIG.regionId,
    name: CONFIG.name,
    nameNe: CONFIG.nameNe,
    bbox: CONFIG.bbox,
    snapshot,
    preparedAt: new Date().toISOString(),
    source: "OpenStreetMap contributors, via the Overpass API",
    license: "ODbL-1.0",
    attribution: "© OpenStreetMap contributors",
    query: CONFIG.query,
    includedRoadClasses: classes,
    stats: {
      nodes: nodeCount,
      edges: edges.length,
      roadKm: Math.round(roadM / 100) / 10,
      components: componentSize.size,
      largestComponentShare: Math.round((largest / nodeCount) * 1000) / 1000,
      healthFacilities: health.length,
      hospitals: health.filter((a) => a.subtype === "hospital").length,
      schools: assets.filter((a) => a.kind === "school").length,
      settlements: assets.filter((a) => a.kind === "settlement").length,
      gazetteerEntries: gazetteer.length,
      excludedCrossBorder,
    },
    knownLimitations: [
      "Only motorable road classes are included. Footpaths and trails are excluded, so walking access is not analysed.",
      "Road condition, seasonal closures, vehicle availability and travel time are not modelled. Distances are measured along mapped roads.",
      "OpenStreetMap coverage in rural Nepal is incomplete. Missing roads or facilities change the results.",
      "Facility levels come from OSM tags and names and can be wrong (for example, sub-health posts tagged as hospitals).",
      "Settlement points are approximate centres, not boundaries. Population appears only where OSM has a population tag; it is never estimated.",
      "Areas across the national border are excluded.",
    ],
  };

  const network: RoadNetworkFile = { datasetId: CONFIG.id, nodes, edges, geometry, classes, names };
  return {
    manifest,
    network,
    assets: { datasetId: CONFIG.id, assets } satisfies AssetsFile,
    gazetteer: { datasetId: CONFIG.id, entries: gazetteer } satisfies GazetteerFile,
  };
}

async function main() {
  const { input, fetch: shouldFetch, out } = parseArgs();
  if (!input && !shouldFetch) {
    console.error("Pass --input <overpass.json> or --fetch");
    process.exit(1);
  }
  const raw: OverpassResponse = input ? JSON.parse(readFileSync(input, "utf8")) : await fetchOverpass();
  const { manifest, network, assets, gazetteer } = build(raw);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "dataset.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(path.join(out, "network.json"), JSON.stringify(network));
  writeFileSync(path.join(out, "assets.json"), JSON.stringify(assets, null, 1) + "\n");
  writeFileSync(path.join(out, "gazetteer.json"), JSON.stringify(gazetteer, null, 1) + "\n");
  writeFileSync(path.join(out, "SOURCE.md"), sourceNotes(manifest));
  console.log(JSON.stringify(manifest.stats, null, 2));
  console.log(`Snapshot ${manifest.snapshot} → ${out}`);
}

function sourceNotes(m: DatasetManifest): string {
  const s = m.stats;
  return `# ${m.name}

${m.nameNe ?? ""}

- **Dataset id:** \`${m.id}\` (region \`${m.regionId}\`)
- **Source:** ${m.source}
- **Licence:** Open Database License (ODbL 1.0). Attribution: ${m.attribution}.
  This processed extract is a derivative database and is shared under the same licence.
- **OSM snapshot:** ${m.snapshot}
- **Bounding box (S, W, N, E):** ${m.bbox.join(", ")}
- **Query:** \`${m.query}\` (limited to Nepal's national boundary)
- **Regenerate:** \`npm run data:fetch\` (or \`npm run data:prepare -- <overpass.json>\`)

## Contents

| | Count |
|---|---|
| Road graph nodes / edges | ${s.nodes} / ${s.edges} |
| Mapped road length | ${s.roadKm} km |
| Connected components | ${s.components} (largest holds ${Math.round(s.largestComponentShare * 100)}% of nodes) |
| Health facilities (of which hospitals) | ${s.healthFacilities} (${s.hospitals}) |
| Schools | ${s.schools} |
| Settlements | ${s.settlements} |
| Gazetteer entries | ${s.gazetteerEntries} |

Road classes included: ${m.includedRoadClasses.join(", ")}.

## Known limitations

${m.knownLimitations.map((l) => `- ${l}`).join("\n")}

This is not authoritative or complete geographic data. Results built on it are candidates for human review.
`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
