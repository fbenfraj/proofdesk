import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { localeStrings } from "@/app/_lib/i18n";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string): string => readFileSync(`${REPO_ROOT}${rel}`, "utf8");
const COMPONENT = "app/_components/how-it-works.tsx";

describe("First-run explainer wires the AI-9 explainer copy (AI-10 renders it)", () => {
  test("copy comes from the catalog, not hardcoded", () => {
    const c = read(COMPONENT);
    expect(c.includes("localeStrings")).toBe(true);
    expect(c.includes("explainer")).toBe(true);
    expect(c.includes(".steps")).toBe(true);
  });

  test("auto-opens once via a localStorage flag, re-openable after", () => {
    const c = read(COMPONENT);
    expect(c.includes("localStorage")).toBe(true);
    expect(c.includes("proofdesk_explainer_seen")).toBe(true);
  });

  test("the persistent trigger and dismiss use the catalog labels", () => {
    const c = read(COMPONENT);
    expect(c.includes("reopen")).toBe(true);
    expect(c.includes("dismiss")).toBe(true);
  });

  test("AppShell mounts the explainer", () => {
    expect(read("app/_components/app-shell.tsx").includes("HowItWorks")).toBe(true);
  });

  test("the catalog copy the overlay renders is present in both locales", () => {
    for (const locale of ["en", "fr"] as const) {
      const e = localeStrings(locale).explainer;
      expect(e.steps.length).toBe(4);
      expect(e.reopen.length).toBeGreaterThan(0);
      expect(e.dismiss.length).toBeGreaterThan(0);
    }
  });
});
