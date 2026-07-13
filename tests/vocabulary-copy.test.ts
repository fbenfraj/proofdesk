import { describe, expect, test } from "vitest";
import { localeStrings, type Locale } from "@/app/_lib/i18n";

const LOCALES: Locale[] = ["en", "fr"];

describe("AI-9 Chrome relabels", () => {
  test("no rail label mentions 'cockpit' in any locale", () => {
    for (const locale of LOCALES) {
      const rail = localeStrings(locale).rail;
      for (const label of Object.values(rail)) {
        expect(label.toLowerCase()).not.toContain("cockpit");
      }
    }
  });

  test("the Campaign Board rail label is set", () => {
    expect(localeStrings("en").rail["audit-cockpit"]).toBe("Campaign Board");
    expect(localeStrings("fr").rail["audit-cockpit"]).toBe("Tableau de campagne");
  });

  test("the override section heading reads 'Operator override'", () => {
    expect(localeStrings("en").drawer.sections.override).toBe("Operator override");
    expect(localeStrings("fr").drawer.sections.override).toBe("Contournement opérateur");
  });
});
