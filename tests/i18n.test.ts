import { describe, expect, it } from "vitest";
import { DICTIONARIES, LOCALES, isLocale, t } from "@/lib/i18n";

// The failure this guards against is silent. A missing Nepali string falls back to English rather
// than throwing, so it would ship as an English sentence in the middle of a Nepali form — on the
// one screen where the reader may not read English at all.

const placeholders = (text: string): string[] => (text.match(/\{(\w+)\}/g) ?? []).sort();

describe("public strings", () => {
  const english = Object.keys(DICTIONARIES.en) as Array<keyof typeof DICTIONARIES.en>;

  it("defines every English key in Nepali, and nothing extra", () => {
    const nepali = Object.keys(DICTIONARIES.ne);
    expect(new Set(nepali)).toEqual(new Set(english));
  });

  it("has no empty strings", () => {
    for (const { code } of LOCALES) {
      for (const key of english) {
        expect(DICTIONARIES[code][key]?.trim(), `${code}/${key}`).not.toBe("");
      }
    }
  });

  it("uses the same placeholders in both languages", () => {
    for (const key of english) {
      expect(placeholders(DICTIONARIES.ne[key]), key).toEqual(placeholders(DICTIONARIES.en[key]));
    }
  });

  it("actually translates: the Nepali is not a copy of the English", () => {
    // A handful of strings are legitimately identical across languages ("English", "OpenStreetMap").
    // This catches the real failure, which is a whole dictionary left untranslated.
    const identical = english.filter((key) => DICTIONARIES.ne[key] === DICTIONARIES.en[key]);
    expect(identical.length).toBeLessThan(english.length * 0.1);
  });

  it("writes Nepali in Devanagari, not romanised", () => {
    const devanagari = /[ऀ-ॿ]/;
    const missing = english.filter((key) => !devanagari.test(DICTIONARIES.ne[key]));
    expect(missing).toEqual([]);
  });
});

describe("translation lookup", () => {
  it("substitutes values", () => {
    expect(t("en", "form.where.accuracy", { m: 25 })).toContain("25");
    expect(t("ne", "form.where.accuracy", { m: 25 })).toContain("25");
    expect(t("en", "form.attachments", { n: 4, mb: 8 })).toBe("Attach up to 4 files, 8 MB each.");
  });

  it("leaves an unknown placeholder visible rather than printing undefined", () => {
    expect(t("en", "form.where.accuracy")).toContain("{m}");
  });

  it("recognises only real locales", () => {
    expect(isLocale("ne")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fil")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale("")).toBe(false);
  });

  it("falls back to English rather than showing nothing when a translation is missing", () => {
    // Unreachable with the dictionaries as they stand — the completeness test above guarantees that.
    // This checks the safety net itself, by taking one key away from the dictionary `t` really reads
    // and putting it back afterwards.
    const dictionary = DICTIONARIES.ne as Record<string, string>;
    const removed = dictionary["form.submit"];
    delete dictionary["form.submit"];
    try {
      expect(t("ne", "form.submit")).toBe(DICTIONARIES.en["form.submit"]);
    } finally {
      dictionary["form.submit"] = removed;
    }
  });
});
