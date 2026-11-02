import { describe, expect, it } from "vitest";
import { isLocale, locales, localizedPath, switchLocale } from "./config";
import { dictionaries, useTranslations } from "./t";

describe("localizedPath", () => {
  it("prefixes the locale and normalizes slashes", () => {
    expect(localizedPath("es")).toBe("/es");
    expect(localizedPath("en", "/sistemas-operativos/")).toBe("/en/sistemas-operativos");
  });
});

describe("switchLocale", () => {
  it("keeps the rest of the path", () => {
    expect(switchLocale("/es/sistemas-operativos/planificador-cpu", "en")).toBe(
      "/en/sistemas-operativos/planificador-cpu",
    );
  });

  it("handles the locale root and unprefixed paths", () => {
    expect(switchLocale("/en", "es")).toBe("/es");
    expect(switchLocale("/", "en")).toBe("/en");
  });
});

describe("isLocale", () => {
  it("accepts only configured locales", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("ui dictionaries", () => {
  it("have the same keys and no empty strings in every locale", () => {
    const reference = Object.keys(dictionaries.es).sort();
    for (const locale of locales) {
      const dict = dictionaries[locale];
      expect(Object.keys(dict).sort()).toEqual(reference);
      for (const value of Object.values(dict)) expect(value.trim()).not.toBe("");
    }
  });

  it("translates through useTranslations", () => {
    expect(useTranslations("en")("nav.paths")).toBe("Paths");
    expect(useTranslations("es")("nav.paths")).toBe("Rutas");
  });
});
