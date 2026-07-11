import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { LOCALES, localeStrings } from "@/app/_lib/i18n";
import { DELIVERABLE_TYPE } from "@/src/ruleset";

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
