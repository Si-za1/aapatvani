export type HazardIcon =
  | "landslide"
  | "flood"
  | "debris_flow"
  | "glof"
  | "earthquake"
  | "fire"
  | "windstorm"
  | "lightning"
  | "heavy_rain"
  | "avalanche"
  | "cold_wave"
  | "typhoon"
  | "storm_surge"
  | "volcano"
  | "tsunami"
  | "other"
  | "unclear";

export interface HazardDef {
  id: string;
  label: string;
  labelLocal: string;
  icon: HazardIcon;
  /** Hazards that often occur together, so reports may describe the same event. */
  compatibleWith: string[];
}

export interface RegionLanguage {
  code: "en" | "ne" | "fil";
  label: string;
  native: string;
}

export interface RegionConfig {
  id: string;
  name: string;
  nameLocal: string;
  status: "primary" | "configuration_only";
  statusNote: string;
  timezone: string;
  utcOffset: string;
  languages: RegionLanguage[];
  hazards: HazardDef[];
  map: { center: [number, number]; zoom: number };
  /** Geographic datasets available for impact analysis in this region. */
  datasetIds: string[];
  emergencyNumbers: Array<{ label: string; labelLocal: string; number: string }>;
  emergencyNote: string;
}
