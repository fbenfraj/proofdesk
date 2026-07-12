import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { LOCALES, localeStrings } from "@/app/_lib/i18n";
import { DELIVERABLE_TYPE, FRANCE_EU_DISCLOSURE } from "@/src/ruleset";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string): string => readFileSync(`${REPO_ROOT}${rel}`, "utf8");

const PAGE = "app/(ui)/proof-brief/page.tsx";
const COMPONENT = "app/_components/proof-brief.tsx";

describe("Proof Brief surface is real, not a placeholder (Story 3.2, AC1)", () => {
  test("the page no longer renders SurfacePlaceholder", () => {
    const page = read(PAGE);
    expect(page.includes("SurfacePlaceholder")).toBe(false);
    expect(page.includes("getProofBrief")).toBe(true);
    expect(page.includes("<ProofBrief")).toBe(true);
  });

  test("copy comes from the i18n catalog, not hardcoded strings", () => {
    const component = read(COMPONENT);
    expect(component.includes("localeStrings")).toBe(true);
    expect(component.includes("s.proofBrief")).toBe(true);
  });

  test("criticality renders as a text tag on a non-colour channel (UX-DR14/NFR-D7)", () => {
    const component = read(COMPONENT);
    // The tag class carries the criticality; the label text is the second channel.
    expect(component.includes("pd-pbrief__crit--")).toBe(true);
    expect(component.includes("s.drawer.criticality[criticality]")).toBe(true);
  });

  test("the provisional-not-yet-confirmed honesty is surfaced (GATE b/3)", () => {
    const component = read(COMPONENT);
    expect(component.includes("provisionalBadge")).toBe(true);
    expect(component.includes("preview.provisional")).toBe(true);
  });
});

describe("France/EU disclosure checklist + three-tier severity surface (Story 3.3)", () => {
  const component = read(COMPONENT);

  test("the disclosure checklist + three-tier severity control are rendered", () => {
    expect(component.includes("DisclosureChecklist")).toBe(true);
    expect(component.includes("DisclosureControl")).toBe(true);
    // The severity selector drives the tier via the enum, not a hardcoded list.
    expect(component.includes("DISCLOSURE_STATE")).toBe(true);
    expect(component.includes("onSetSeverity")).toBe(true);
  });

  test("the standing disclosure caveat + evidence-assistance framing come from i18n", () => {
    expect(component.includes("d.caveat")).toBe(true);
    expect(component.includes("d.framing")).toBe(true);
    // The locked legal copy must not be hardcoded in JSX — only referenced via the
    // i18n keys. Strip comments first so explanatory JSDoc (which names the copy)
    // doesn't trip the guard; the check is about rendered string literals.
    const codeOnly = component.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codeOnly.includes("not a compliance determination")).toBe(false);
    expect(codeOnly.includes("not legal advice")).toBe(false);
  });

  test('"collaboration commerciale" renders wrapped in <span lang="fr"> (AC1.2)', () => {
    expect(component.includes('lang="fr"')).toBe(true);
    // The verbatim-French decision keys off the stable ruleset flag, not a label.
    expect(component.includes("verbatimFrench")).toBe(true);
  });

  test("the disclosure row name is localized from the stable key, not the raw label", () => {
    // Codex [P2]: the attached row must render disclosure.name[key], not req.label.
    expect(component.includes("disclosure.name[req.disclosureKey]")).toBe(true);
    expect(component.includes("req.disclosureKey")).toBe(true);
  });

  test.each(LOCALES)("%s names all three France/EU disclosure items", (locale) => {
    const d = localeStrings(locale).proofBrief.disclosure;
    for (const key of FRANCE_EU_DISCLOSURE) {
      expect(d.name[key]?.length, `${locale}:${key}`).toBeGreaterThan(0);
    }
  });
});

describe("i18n catalog is complete for every Deliverable type + satisfaction (both locales)", () => {
  test.each(LOCALES)("%s has a template name for all five Deliverable types", (locale) => {
    const p = localeStrings(locale).proofBrief;
    for (const type of DELIVERABLE_TYPE) {
      expect(p.templateName[type]?.length).toBeGreaterThan(0);
    }
  });

  test.each(LOCALES)("%s labels every satisfaction type", (locale) => {
    const p = localeStrings(locale).proofBrief;
    for (const sat of [
      "link-reachability",
      "human-assertion",
      "structured-field",
      "disclosure",
    ] as const) {
      expect(p.satisfaction[sat]?.length).toBeGreaterThan(0);
    }
  });
});
