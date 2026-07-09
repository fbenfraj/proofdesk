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

describe("Campaign Board copy (Story 1.6, EN|FR no-truncation)", () => {
  test("every board string resolves non-empty in EN and FR", () => {
    for (const locale of LOCALES) {
      const board = localeStrings(locale).board;
      for (const [key, value] of Object.entries(board)) {
        expect(value.length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  test("FR Proof Status header uses the locked glossary term", () => {
    expect(localeStrings("fr").board.statusHeader).toBe("Statut de preuve");
  });
});

describe("Run Proof Audit & Proof-Readiness copy (Story 1.7, EN|FR)", () => {
  test("every fixed audit string resolves non-empty in EN and FR", () => {
    for (const locale of LOCALES) {
      const a = localeStrings(locale).audit;
      const fixed = [
        a.runButton,
        a.runningButton,
        a.reRunPrefix,
        a.runningLine,
        a.readinessTitle,
        a.readinessCaption,
        a.readinessPending,
        a.statusLabel.defensible,
        a.statusLabel.caveated,
        a.statusLabel.cantClaim,
      ];
      for (const value of fixed) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  test("FR run button + readiness title + status labels use locked glossary terms", () => {
    const a = localeStrings("fr").audit;
    expect(a.runButton).toBe("Lancer l’audit");
    expect(a.readinessTitle).toBe("Niveau de preuve");
    expect(a.statusLabel.defensible).toBe("Défendable");
    expect(a.statusLabel.caveated).toBe("Sous réserve");
    expect(a.statusLabel.cantClaim).toBe("Non défendable");
  });

  test("EN aria-live announcement is the verbatim magic-moment string (UX-DR25)", () => {
    // The exact string the accessibility spine requires for the seeded demo.
    expect(
      localeStrings("en").audit.announcement({ green: 7, yellow: 1, red: 1, marked: 9, total: 9 }),
    ).toBe(
      "Audit complete. 7 Defensible, 1 Caveated, 1 Can't claim. " +
        "You marked 9 of 9 done; ProofDesk can back 7.",
    );
  });

  test("EN reading note is the verbatim demo string", () => {
    expect(localeStrings("en").audit.readingNote(9, 9, 7)).toBe(
      "You marked 9/9 done · ProofDesk can back 7.",
    );
  });

  test("FR announcement uses locked status terms and localized structure", () => {
    expect(
      localeStrings("fr").audit.announcement({ green: 7, yellow: 1, red: 1, marked: 9, total: 9 }),
    ).toBe(
      "Audit terminé. 7 Défendable, 1 Sous réserve, 1 Non défendable. " +
        "Vous avez marqué 9 sur 9 comme faits ; ProofDesk peut en étayer 7.",
    );
  });
});

describe("Claim Card drawer copy (Story 1.8, EN|FR)", () => {
  test("every fixed drawer string resolves non-empty in EN and FR", () => {
    for (const locale of LOCALES) {
      const d = localeStrings(locale).drawer;
      const fixed = [
        d.closeAria,
        d.nextClaim,
        d.loading,
        d.loadError,
        d.uploadedLabel,
        d.machineVerdictLabel,
        d.sections.requirements,
        d.sections.evidence,
        d.sections.facts,
        d.sections.caveat,
        d.sections.override,
        d.criticality.critical,
        d.criticality.supporting,
        d.provenance.machine,
        d.provenance.human,
        d.pendingNote,
        d.caveatEmpty,
        d.overrideEmpty,
        d.unsatisfied,
        d.liveness.live,
        d.liveness.dead,
        d.liveness.blocked,
        d.liveness.unresolved,
      ];
      for (const value of fixed) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  test("requirement-kind and evidence-type maps cover the seeded vocabulary in both locales", () => {
    const kinds = ["proof-of-posting", "disclosure-visible", "reach-metric", "segment-timestamp"];
    const types = ["link", "creator-attestation", "disclosure-screenshot", "metric-screenshot"];
    for (const locale of LOCALES) {
      const d = localeStrings(locale).drawer;
      for (const k of kinds) expect((d.requirementKind[k] ?? "").length).toBeGreaterThan(0);
      for (const t of types) expect((d.evidenceType[t] ?? "").length).toBeGreaterThan(0);
    }
  });

  test("FR drawer uses locked glossary terms (provenance, override)", () => {
    const d = localeStrings("fr").drawer;
    expect(d.provenance.machine).toBe("Fait vérifié par la machine");
    expect(d.provenance.human).toBe("Déclaration humaine");
    expect(d.sections.override).toBe("Arbitrage humain");
  });

  test("satisfiedBy + confirmedBy builders render provenance-correct copy", () => {
    const en = localeStrings("en").drawer;
    expect(en.satisfiedBy("machine")).toBe("satisfied by machine-checked fact");
    expect(en.satisfiedBy("human")).toBe("satisfied by human assertion");
    expect(en.confirmedBy("camille@x", "2026-05-12")).toBe("Confirmed by camille@x · 2026-05-12");
  });
});

describe("Human override & caveat copy (Story 1.9, EN|FR)", () => {
  test("every override + caveat authoring string resolves non-empty in EN and FR", () => {
    for (const locale of LOCALES) {
      const d = localeStrings(locale).drawer;
      const fixed = [
        d.override.switchLabel,
        d.override.on,
        d.override.off,
        d.override.setPrompt,
        d.override.statusLabel.green,
        d.override.statusLabel.yellow,
        d.override.statusLabel.red,
        d.caveat.add,
        d.caveat.placeholder,
        d.caveat.save,
        d.caveat.cancel,
        d.caveat.requiresNote,
        d.mutationError,
      ];
      for (const value of fixed) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  test("FR override uses the locked glossary terms (Arbitrage humain + status labels)", () => {
    const d = localeStrings("fr").drawer;
    expect(d.override.switchLabel).toBe("Arbitrage humain");
    expect(d.override.statusLabel.green).toBe("Défendable");
    expect(d.override.statusLabel.yellow).toBe("Sous réserve");
    expect(d.override.statusLabel.red).toBe("Non défendable");
  });

  test("attribution builders render the mono 'by [operator] · [agency]' line", () => {
    expect(localeStrings("en").drawer.override.by("Farouk", "Frajtech")).toBe(
      "by Farouk · Frajtech",
    );
    expect(localeStrings("fr").drawer.override.by("Farouk", "Frajtech")).toBe(
      "par Farouk · Frajtech",
    );
    expect(localeStrings("en").drawer.caveat.by("Farouk")).toBe("by Farouk");
  });

  test("the on/off word differs so it is a real color-independent cue (UX-DR17)", () => {
    for (const locale of LOCALES) {
      const o = localeStrings(locale).drawer.override;
      expect(o.on).not.toBe(o.off);
    }
  });
});
