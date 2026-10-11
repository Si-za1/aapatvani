import type { RegionConfig } from "./types";

const waterRelated = ["typhoon", "flood", "landslide", "storm_surge"];

/**
 * Configuration-only region. It demonstrates how hazards, languages and settings adapt.
 * No geographic dataset is loaded, so impact analysis is unavailable, and nothing here
 * has been validated with Philippine responders.
 */
export const philippines: RegionConfig = {
  id: "ph",
  name: "Philippines",
  nameLocal: "Pilipinas",
  status: "configuration_only",
  statusNote:
    "Configuration only. No geographic dataset is loaded, so Blast Radius Analysis is unavailable. Not validated with Philippine responders.",
  timezone: "Asia/Manila",
  utcOffset: "+08:00",
  languages: [
    { code: "en", label: "English", native: "English" },
    { code: "fil", label: "Filipino", native: "Filipino" },
  ],
  hazards: [
    { id: "typhoon", label: "Typhoon", labelLocal: "Bagyo", icon: "typhoon", compatibleWith: waterRelated },
    { id: "flood", label: "Flood", labelLocal: "Baha", icon: "flood", compatibleWith: waterRelated },
    { id: "landslide", label: "Landslide", labelLocal: "Pagguho ng lupa", icon: "landslide", compatibleWith: [...waterRelated, "earthquake"] },
    { id: "storm_surge", label: "Storm surge", labelLocal: "Daluyong", icon: "storm_surge", compatibleWith: waterRelated },
    { id: "earthquake", label: "Earthquake", labelLocal: "Lindol", icon: "earthquake", compatibleWith: ["landslide", "tsunami", "fire"] },
    { id: "tsunami", label: "Tsunami", labelLocal: "Tsunami", icon: "tsunami", compatibleWith: ["earthquake"] },
    { id: "volcanic_eruption", label: "Volcanic eruption", labelLocal: "Pagputok ng bulkan", icon: "volcano", compatibleWith: ["earthquake"] },
    { id: "fire", label: "Fire", labelLocal: "Sunog", icon: "fire", compatibleWith: ["earthquake"] },
    { id: "other", label: "Other", labelLocal: "Iba pa", icon: "other", compatibleWith: [] },
    { id: "unclear", label: "Unclear", labelLocal: "Hindi malinaw", icon: "unclear", compatibleWith: [] },
  ],
  map: { center: [12.88, 121.77], zoom: 6 },
  datasetIds: [],
  emergencyNumbers: [{ label: "National emergency hotline", labelLocal: "Pambansang emergency hotline", number: "911" }],
  emergencyNote:
    "Configuration example only. AapatVani is not an emergency line; contact local emergency services. Verify numbers locally before operational use.",
};
