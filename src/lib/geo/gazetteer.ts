// Resolves place names mentioned in reports against the regional gazetteer (OpenStreetMap names).
// Deterministic. Gemini only extracts the mention; coordinates always come from here, GPS or a pin.

import type { GazetteerEntry } from "./dataset-types";
import { haversineM } from "./math";

const GENERIC_WORDS = new Set([
  "bazaar", "bazar", "village", "gaun", "gau", "gaon", "tole", "chowk", "chok", "area", "near", "the",
  "road", "highway", "rajmarg", "bridge", "pul", "khola", "nadi", "river", "school", "ward", "municipality",
  "rural", "vdc", "district", "nagar", "palika",
  "नजिक", "बजार", "टोल", "चोक", "पुल", "खोला", "नदी", "राजमार्ग", "सडक", "वडा", "क्षेत्र", "तिर", "मा",
]);

export function normalizePlace(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[​-‍﻿]/g, "")
    .replace(/[^a-z0-9ऀ-ॿ ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !GENERIC_WORDS.has(w))
    .join(" ")
    .trim();
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

const KIND_PRIORITY: Record<string, number> = {
  city: 0, town: 1, village: 2, suburb: 3, hamlet: 4, neighbourhood: 5, locality: 6,
  health_facility: 7, school: 8, isolated_dwelling: 9, landmark: 10,
};

export type PlaceMatch = {
  entry: GazetteerEntry;
  matchType: "exact" | "exact_ne" | "alias" | "fuzzy" | "transliteration";
  score: number;
};

export type PlaceResolution = {
  matches: PlaceMatch[];
  best?: PlaceMatch;
  ambiguous: boolean;
};

/**
 * Matches a mention (verbatim text plus an optional romanised form) against the gazetteer.
 * Returns `ambiguous` when equally good matches are more than 3 km apart, the caller must
 * then ask a reviewer instead of picking one.
 */
export function resolvePlace(
  mention: { text: string; romanized?: string },
  entries: GazetteerEntry[],
): PlaceResolution {
  const forms = [
    { value: normalizePlace(mention.text), viaTransliteration: false },
    ...(mention.romanized ? [{ value: normalizePlace(mention.romanized), viaTransliteration: true }] : []),
  ].filter((f) => f.value.length >= 2);
  const results = new Map<string, PlaceMatch>();

  const consider = (entry: GazetteerEntry, match: PlaceMatch["matchType"], score: number) => {
    const current = results.get(entry.id);
    if (!current || current.score < score) results.set(entry.id, { entry, matchType: match, score });
  };

  for (const entry of entries) {
    const name = normalizePlace(entry.name);
    const nameNe = entry.nameNe ? normalizePlace(entry.nameNe) : "";
    const alts = entry.alt.map(normalizePlace).filter(Boolean);
    for (const form of forms) {
      const v = form.value;
      const tag = form.viaTransliteration ? "transliteration" : undefined;
      if (v === name) consider(entry, tag ?? "exact", form.viaTransliteration ? 0.9 : 1);
      else if (nameNe && v === nameNe) consider(entry, "exact_ne", 1);
      else if (alts.includes(v)) consider(entry, tag ?? "alias", 0.92);
      else {
        // The mention may contain the name ("landslide near Larcha bridge" → "larcha").
        const words = v.split(" ");
        const containsName = [name, nameNe].some((n) => n && n.length >= 3 && (words.includes(n) || (n.includes(" ") && v.includes(n))));
        if (containsName) consider(entry, tag ?? "alias", 0.85);
        const best = Math.max(similarity(v, name), nameNe ? similarity(v, nameNe) : 0);
        if (v.length >= 5 && best >= 0.84) consider(entry, tag ?? "fuzzy", best * 0.9);
      }
    }
  }

  const matches = [...results.values()].sort(
    (a, b) =>
      b.score - a.score ||
      (KIND_PRIORITY[a.entry.kind] ?? 11) - (KIND_PRIORITY[b.entry.kind] ?? 11) ||
      a.entry.id.localeCompare(b.entry.id),
  );
  const top = matches[0];
  if (!top) return { matches, ambiguous: false };
  const rivals = matches.filter(
    (m) => m !== top && m.score >= top.score - 0.02 &&
      haversineM(m.entry.lat, m.entry.lng, top.entry.lat, top.entry.lng) > 3000,
  );
  return { matches: matches.slice(0, 5), best: rivals.length ? undefined : top, ambiguous: rivals.length > 0 };
}
