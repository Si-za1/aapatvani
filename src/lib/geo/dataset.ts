import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getRegion } from "@/config/regions";
import type { AssetsFile, DatasetManifest, GazetteerFile, RoadNetworkFile } from "./dataset-types";
import { RoadGraph } from "./graph";
import { bboxContains } from "./math";

// Loads the pre-processed regional datasets that ship with the app (data/regions/...).

const DATASET_DIRS: Record<string, string> = {
  "np-araniko-corridor": "data/regions/nepal/araniko-corridor",
};

export type LoadedDataset = {
  manifest: DatasetManifest;
  graph: RoadGraph;
  assets: AssetsFile["assets"];
  gazetteer: GazetteerFile["entries"];
};

const cache = new Map<string, Promise<LoadedDataset | null>>();

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

export function loadDataset(id: string): Promise<LoadedDataset | null> {
  const dir = DATASET_DIRS[id];
  if (!dir) return Promise.resolve(null);
  let pending = cache.get(id);
  if (!pending) {
    const root = path.join(process.cwd(), dir);
    pending = Promise.all([
      readJson<DatasetManifest>(path.join(root, "dataset.json")),
      readJson<RoadNetworkFile>(path.join(root, "network.json")),
      readJson<AssetsFile>(path.join(root, "assets.json")),
      readJson<GazetteerFile>(path.join(root, "gazetteer.json")),
    ])
      .then(([manifest, network, assets, gazetteer]) => ({
        manifest,
        graph: new RoadGraph(network),
        assets: assets.assets,
        gazetteer: gazetteer.entries,
      }))
      .catch((err) => {
        console.error(`Failed to load dataset ${id}`, err);
        cache.delete(id);
        return null;
      });
    cache.set(id, pending);
  }
  return pending;
}

export async function loadManifest(id: string): Promise<DatasetManifest | null> {
  const dir = DATASET_DIRS[id];
  if (!dir) return null;
  return readJson<DatasetManifest>(path.join(process.cwd(), dir, "dataset.json")).catch(() => null);
}

/** Datasets configured for a region, optionally only those covering a point. */
export async function datasetsForRegion(regionId: string, point?: { lat: number; lng: number }): Promise<LoadedDataset[]> {
  const region = getRegion(regionId);
  const loaded = (await Promise.all(region.datasetIds.map(loadDataset))).filter((d): d is LoadedDataset => Boolean(d));
  return point ? loaded.filter((d) => bboxContains(d.manifest.bbox, point.lat, point.lng)) : loaded;
}
