import { nepal } from "./nepal";
import { philippines } from "./philippines";
import type { HazardDef, RegionConfig } from "./types";

export type { HazardDef, RegionConfig } from "./types";

export const REGIONS: RegionConfig[] = [nepal, philippines];
export const DEFAULT_REGION_ID = "np";

export function getRegion(id: string | undefined): RegionConfig {
  return REGIONS.find((r) => r.id === id) ?? nepal;
}

export function getHazard(region: RegionConfig, id: string | undefined): HazardDef | undefined {
  return region.hazards.find((h) => h.id === id);
}

export function hazardLabel(region: RegionConfig, id: string | undefined): string {
  return getHazard(region, id)?.label ?? (id ? id.replace(/_/g, " ") : "Unclear");
}

/** "same", "compatible", "different" or "unknown" for two hazard ids in a region. */
export function hazardRelation(
  region: RegionConfig,
  a: string | undefined,
  b: string | undefined,
): "same" | "compatible" | "different" | "unknown" {
  const informative = (h?: string) => h && h !== "unclear" && h !== "other";
  if (!informative(a) || !informative(b)) return "unknown";
  if (a === b) return "same";
  const ha = getHazard(region, a);
  const hb = getHazard(region, b);
  if (ha?.compatibleWith.includes(b!) || hb?.compatibleWith.includes(a!)) return "compatible";
  return "different";
}
