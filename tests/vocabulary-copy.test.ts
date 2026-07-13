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

describe("AI-9 surface leads (subheads)", () => {
  const LOCALES2: Locale[] = ["en", "fr"];
  test("board / inbox / proofBrief each have a non-empty lead in both locales", () => {
    for (const locale of LOCALES2) {
      const s = localeStrings(locale);
      expect(s.board.lead.length, `board ${locale}`).toBeGreaterThan(0);
      expect(s.inbox.lead.length, `inbox ${locale}`).toBeGreaterThan(0);
      expect(s.proofBrief.lead.length, `proofBrief ${locale}`).toBeGreaterThan(0);
    }
  });
  test("the Board lead teaches what the surface is (mentions claims/evidence)", () => {
    expect(localeStrings("en").board.lead.toLowerCase()).toContain("claim");
  });
});

describe("AI-9 empty-state teaching", () => {
  const LOCALES3: Locale[] = ["en", "fr"];
  test("the Campaign Board empty state teaches, not just 'no campaign'", () => {
    expect(localeStrings("en").board.emptyState.toLowerCase()).toContain("claim");
  });
  test("board + report empty states are non-empty in both locales", () => {
    for (const locale of LOCALES3) {
      const s = localeStrings(locale);
      expect(s.board.emptyState.length).toBeGreaterThan(0);
      expect(s.report.emptyNoReport.length).toBeGreaterThan(0);
    }
  });
});
