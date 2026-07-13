import { describe, expect, test } from "vitest";
import type { Locale } from "@/app/_lib/i18n";
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
});
