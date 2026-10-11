import { describe, expect, it } from "vitest";
import type { GazetteerEntry } from "@/lib/geo/dataset-types";
import { normalizePlace, resolvePlace } from "@/lib/geo/gazetteer";

const entry = (id: string, name: string, nameNe: string, kind: string, lat: number, lng: number, alt: string[] = []): GazetteerEntry => ({
  id, name, nameNe, alt, kind, lat, lng, uncertaintyM: 500, source: "test",
});

const ENTRIES: GazetteerEntry[] = [
  entry("osm:node/10", "Tatopani", "तातोपानी", "suburb", 27.94484, 85.94901),
  entry("osm:node/11", "Larcha", "लार्चा", "hamlet", 27.93309, 85.93534),
  entry("osm:node/12", "Kabhre", "काभ्रे", "hamlet", 27.7883, 85.9636),
  entry("osm:node/13", "Kabhre", "काभ्रे", "hamlet", 27.8154, 85.8942),
  entry("osm:node/14", "Barhabise", "बाह्रविसे", "town", 27.7878, 85.8996, ["Bahrabise"]),
];

describe("place name resolution", () => {
  it("matches Nepali and English names exactly", () => {
    expect(resolvePlace({ text: "तातोपानी" }, ENTRIES).best?.matchType).toBe("exact_ne");
    expect(resolvePlace({ text: "Tatopani" }, ENTRIES).best?.entry.id).toBe("osm:node/10");
  });

  it("finds a name inside a longer mention and ignores generic words", () => {
    expect(resolvePlace({ text: "near Larcha bridge" }, ENTRIES).best?.entry.name).toBe("Larcha");
    expect(resolvePlace({ text: "लार्चा नजिक" }, ENTRIES).best?.entry.name).toBe("Larcha");
    expect(resolvePlace({ text: "Bahrabise bazaar" }, ENTRIES).best?.entry.name).toBe("Barhabise");
  });

  it("allows small spelling differences", () => {
    const res = resolvePlace({ text: "Tatopaani" }, ENTRIES);
    expect(res.best?.entry.name).toBe("Tatopani");
    expect(res.best?.matchType).toBe("fuzzy");
  });

  it("uses a romanised form when given one", () => {
    const res = resolvePlace({ text: "टाटोपानी", romanized: "Tatopani" }, ENTRIES);
    expect(res.best?.matchType).toBe("transliteration");
  });

  it("refuses to choose between equally good matches far apart", () => {
    const res = resolvePlace({ text: "काभ्रे" }, ENTRIES);
    expect(res.ambiguous).toBe(true);
    expect(res.best).toBeUndefined();
    expect(res.matches).toHaveLength(2);
  });

  it("returns nothing for unknown places", () => {
    expect(resolvePlace({ text: "Pokhara" }, ENTRIES).matches).toHaveLength(0);
  });

  it("normalises generic words away", () => {
    expect(normalizePlace("Tatopani Bazaar, Ward 2")).toBe("tatopani 2");
  });
});
