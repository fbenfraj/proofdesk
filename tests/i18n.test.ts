import { describe, expect, test } from "vitest";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  localeStrings,
  parseLocale,
  RAIL_SURFACES,
} from "@/app/_lib/i18n";

describe("parseLocale (EN|FR toggle base, UX-DR26)", () => {
  test.each([
    ["en cookie", "en", "en"],
    ["fr cookie", "fr", "fr"],
    ["unknown value falls back to default", "de", "en"],
    ["empty string falls back", "", "en"],
    ["undefined falls back", undefined, "en"],
    ["null falls back", null, "en"],
    ["case-sensitive: EN is not a locale", "EN", "en"],
  ])("%s", (_name, input, expected) => {
    expect(parseLocale(input)).toBe(expected);
  });
});

describe("isLocale type guard", () => {
  test.each([
    ["en", true],
    ["fr", true],
    ["de", false],
    ["", false],
    [undefined, false],
    [null, false],
  ])("%s → %s", (input, expected) => {
    expect(isLocale(input as string | undefined | null)).toBe(expected);
  });
});

describe("locale catalog", () => {
  test("default locale is English and both locales are supported", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect([...LOCALES].sort()).toEqual(["en", "fr"]);
  });

  test("each locale exposes its own endonym as langName (toggle accessible label)", () => {
    expect(localeStrings("en").langName).toBe("English");
    expect(localeStrings("fr").langName).toBe("Français");
  });

  test("every rail surface resolves a non-empty label in EN and FR", () => {
    for (const locale of LOCALES) {
      const s = localeStrings(locale);
      for (const surface of RAIL_SURFACES) {
        expect(s.rail[surface.key].length, `${locale}:${surface.key}`).toBeGreaterThan(0);
      }
    }
  });

  test("the four rail surfaces are in the fixed spine order (UX-DR7)", () => {
    expect(RAIL_SURFACES.map((s) => s.key)).toEqual([
      "audit-cockpit",
      "proof-brief",
      "evidence-inbox",
      "client-safe-report",
    ]);
  });

  test("locked FR rail translations are used verbatim (EXPERIENCE glossary)", () => {
    const fr = localeStrings("fr").rail;
    expect(fr["proof-brief"]).toBe("Cahier des preuves");
    expect(fr["evidence-inbox"]).toBe("Boîte à preuves");
    expect(fr["client-safe-report"]).toBe("Rapport prêt-client");
  });

  test("Audit Cockpit FR is flagged provisional (no locked glossary term)", () => {
    // Guard against silently shipping an un-vetted locked term.
    expect(RAIL_SURFACES.find((s) => s.key === "audit-cockpit")?.frProvisional).toBe(true);
  });
});
