import { describe, expect, test } from "vitest";
import { type Locale, localeStrings } from "@/app/_lib/i18n";

const LOCALES: Locale[] = ["en", "fr"];

describe("AI-9 Chrome relabels", () => {
  test("no stage label mentions 'cockpit' in any locale", () => {
    for (const locale of LOCALES) {
      for (const label of Object.values(localeStrings(locale).stage.labels)) {
        expect(label.toLowerCase()).not.toContain("cockpit");
      }
    }
  });

  test("the run-the-audit stage label is the plain verb form", () => {
    expect(localeStrings("en").stage.labels["run-the-audit"]).toBe("Run the audit");
    expect(localeStrings("fr").stage.labels["run-the-audit"]).toBe("Lancer l’audit");
  });

  test("the override section heading reads 'Operator override' (EN); FR keeps the locked 'Arbitrage humain'", () => {
    expect(localeStrings("en").drawer.sections.override).toBe("Operator override");
    // FR override is a locked glossary term (EXPERIENCE.md#L77); AI-9 does not
    // retranslate it, so it stays "Arbitrage humain" and matches switchLabel.
    expect(localeStrings("fr").drawer.sections.override).toBe("Arbitrage humain");
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

describe("AI-9 first-run explainer copy", () => {
  const LOCALES4: Locale[] = ["en", "fr"];
  test("explainer has intro, 4 steps, dismiss and reopen in both locales", () => {
    for (const locale of LOCALES4) {
      const e = localeStrings(locale).explainer;
      expect(e.intro.length).toBeGreaterThan(0);
      expect(e.steps).toHaveLength(4);
      for (const step of e.steps) expect(step.length).toBeGreaterThan(0);
      expect(e.dismiss.length).toBeGreaterThan(0);
      expect(e.reopen.length).toBeGreaterThan(0);
    }
  });
});
