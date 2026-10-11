import type { RegionConfig } from "./types";

const rainRelated = ["landslide", "debris_flow", "flood", "heavy_rain", "glof"];

export const nepal: RegionConfig = {
  id: "np",
  name: "Nepal",
  nameLocal: "नेपाल",
  status: "primary",
  statusNote:
    "Prototype region. Geographic data covers only the Araniko Highway corridor in Sindhupalchok (OpenStreetMap extract).",
  timezone: "Asia/Kathmandu",
  utcOffset: "+05:45",
  languages: [
    { code: "ne", label: "Nepali", native: "नेपाली" },
    { code: "en", label: "English", native: "English" },
  ],
  hazards: [
    { id: "landslide", label: "Landslide", labelLocal: "पहिरो", icon: "landslide", compatibleWith: [...rainRelated, "earthquake"] },
    { id: "flood", label: "Flood", labelLocal: "बाढी", icon: "flood", compatibleWith: rainRelated },
    { id: "debris_flow", label: "Debris flow", labelLocal: "लेदो बाढी", icon: "debris_flow", compatibleWith: rainRelated },
    { id: "glof", label: "Glacial lake outburst flood", labelLocal: "हिमताल विस्फोट बाढी", icon: "glof", compatibleWith: rainRelated },
    { id: "heavy_rain", label: "Heavy rainfall", labelLocal: "अतिवृष्टि", icon: "heavy_rain", compatibleWith: [...rainRelated, "windstorm", "lightning"] },
    { id: "earthquake", label: "Earthquake", labelLocal: "भूकम्प", icon: "earthquake", compatibleWith: ["landslide", "avalanche", "fire"] },
    { id: "fire", label: "Fire", labelLocal: "आगलागी", icon: "fire", compatibleWith: ["earthquake", "lightning"] },
    { id: "windstorm", label: "Windstorm", labelLocal: "हावाहुरी", icon: "windstorm", compatibleWith: ["heavy_rain", "lightning"] },
    { id: "lightning", label: "Lightning", labelLocal: "चट्याङ", icon: "lightning", compatibleWith: ["heavy_rain", "windstorm", "fire"] },
    { id: "avalanche", label: "Avalanche", labelLocal: "हिमपहिरो", icon: "avalanche", compatibleWith: ["earthquake", "cold_wave"] },
    { id: "cold_wave", label: "Cold wave", labelLocal: "शीतलहर", icon: "cold_wave", compatibleWith: ["avalanche"] },
    { id: "other", label: "Other", labelLocal: "अन्य", icon: "other", compatibleWith: [] },
    { id: "unclear", label: "Unclear", labelLocal: "अस्पष्ट", icon: "unclear", compatibleWith: [] },
  ],
  map: { center: [27.87, 85.9], zoom: 11 },
  datasetIds: ["np-araniko-corridor"],
  emergencyNumbers: [
    { label: "Police", labelLocal: "प्रहरी", number: "100" },
    { label: "Fire", labelLocal: "दमकल", number: "101" },
    { label: "Ambulance", labelLocal: "एम्बुलेन्स", number: "102" },
  ],
  emergencyNote:
    "AapatVani is not an emergency line. If someone is in danger, call local emergency services. Numbers shown here should be verified locally before operational use.",
};
