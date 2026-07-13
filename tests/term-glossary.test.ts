import { describe, expect, test } from "vitest";
import { type Locale, localeStrings } from "@/app/_lib/i18n";
import type { TermKey } from "@/app/_lib/term-glossary";
import { TERM_GLOSSARY, TERM_KEYS, termDefinition, termLabel } from "@/app/_lib/term-glossary";

const LOCALES: Locale[] = ["en", "fr"];

describe("term glossary", () => {
  test("every term has a non-empty label and definition in both locales", () => {
    for (const key of TERM_KEYS) {
      for (const locale of LOCALES) {
        expect(termLabel(locale, key).length, `${key} label ${locale}`).toBeGreaterThan(0);
        expect(termDefinition(locale, key).length, `${key} def ${locale}`).toBeGreaterThan(0);
      }
    }
  });

  test("TERM_KEYS matches the glossary keys exactly", () => {
    expect([...TERM_KEYS].sort()).toEqual(Object.keys(TERM_GLOSSARY).sort());
  });

  test("the Record labels keep their precise words (no rename)", () => {
    expect(termLabel("en", "defensible")).toBe("Defensible");
    expect(termLabel("en", "caveat")).toBe("caveat");
    expect(termLabel("en", "claim")).toBe("claim");
    expect(termLabel("en", "machine-checked")).toBe("Machine-checked fact");
  });

  test("definitions carry no em-dash or en-dash", () => {
    for (const key of TERM_KEYS) {
      for (const locale of LOCALES) {
        expect(termDefinition(locale, key)).not.toMatch(/[—–]/);
      }
    }
  });

  test("glossary labels match the canonical rendered i18n labels (both locales)", () => {
    const rendered: Record<string, (s: ReturnType<typeof localeStrings>) => string> = {
      "machine-checked": (s) => s.drawer.provenance.machine,
      "human-assertion": (s) => s.drawer.provenance.human,
      defensible: (s) => s.audit.statusLabel.defensible,
      caveated: (s) => s.audit.statusLabel.caveated,
      "cant-claim": (s) => s.audit.statusLabel.cantClaim,
    };
    for (const locale of ["en", "fr"] as const) {
      const s = localeStrings(locale);
      for (const [key, get] of Object.entries(rendered)) {
        expect(termLabel(locale, key as TermKey)).toBe(get(s));
      }
    }
  });
});
