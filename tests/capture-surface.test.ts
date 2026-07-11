// Story 2.5 — the mobile capture-only path (UX-DR8, NFR-D8, FR-5). This surface
// is a THIN client of the existing ingest pipeline: its correctness guarantees
// are structural, so they are pinned with static source guards (the repo runs
// Vitest in the `node` environment — no jsdom/testing-library — mirroring the
// honesty-anchor guards).
//
//   AC1 (three actions, deliberately non-responsive): the capture surface offers
//        exactly paste-link / upload-screenshot / paste-note, lives OUTSIDE the
//        desktop `(ui)` shell, and never pulls in the Board / Claim Card / Proof
//        Brief / Report.
//   AC2 (same pipeline, no mobile-only code path): capture POSTs to the ONE
//        shared ingest route `/api/evidence` and adds no mobile-specific ingest
//        endpoint, service, or write path.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { LOCALES, localeStrings } from "@/app/_lib/i18n";

// The repo root (this file lives in <root>/tests/).
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string): string => readFileSync(`${REPO_ROOT}${rel}`, "utf8");

const CAPTURE_PAGE = "app/(capture)/capture/page.tsx";
const CAPTURE_FORM = "app/_components/capture-form.tsx";

describe("Story 2.5 AC2 — same ingest pipeline, no mobile-only code path (FR-5)", () => {
  test("the capture surface POSTs to the shared /api/evidence route", () => {
    const form = read(CAPTURE_FORM);
    expect(form.includes('"/api/evidence"')).toBe(true);
  });

  test("the capture surface references NO /api/ path other than /api/evidence", () => {
    const blob = `${read(CAPTURE_PAGE)}\n${read(CAPTURE_FORM)}`;
    const apiRefs = blob.match(/\/api\/[a-z0-9/[\]-]*/gi) ?? [];
    expect(apiRefs.length).toBeGreaterThan(0);
    for (const ref of apiRefs) {
      expect(ref, `unexpected API path ${ref}`).toBe("/api/evidence");
    }
  });

  test("no mobile-specific ingest route exists under app/api", () => {
    // The ONLY evidence ingest route is app/api/evidence/route.ts. A separate
    // capture/mobile ingest endpoint would BE the forbidden mobile-only path.
    expect(existsSync(`${REPO_ROOT}app/api/evidence/route.ts`)).toBe(true);
    expect(existsSync(`${REPO_ROOT}app/api/capture`)).toBe(false);
    expect(existsSync(`${REPO_ROOT}app/api/mobile`)).toBe(false);
  });
});

describe("Story 2.5 AC1 — deliberately non-responsive: no desktop surfaces on mobile (UX-DR8)", () => {
  test("the (capture) route group has no layout wrapping it in the desktop shell", () => {
    // Only app/(ui)/layout.tsx wraps surfaces in AppShell. The capture group must
    // stay standalone (inherits only the root layout: <html lang> + fonts).
    expect(existsSync(`${REPO_ROOT}app/(capture)/layout.tsx`)).toBe(false);
    expect(existsSync(`${REPO_ROOT}app/(capture)/capture/layout.tsx`)).toBe(false);
  });

  test("the capture sources import none of the desktop-only surfaces", () => {
    const blob = `${read(CAPTURE_PAGE)}\n${read(CAPTURE_FORM)}`;
    const forbidden = [
      "app-shell",
      "proof-board",
      "claim-drawer",
      "audit-cockpit",
      "proof-brief",
      "client-safe-report",
    ];
    for (const mod of forbidden) {
      expect(blob.includes(mod), `capture must not reference desktop surface "${mod}"`).toBe(false);
    }
  });
});

describe("Story 2.5 AC1 — exactly the three stripped actions", () => {
  test("the capture surface offers url / image / text and NOT the desktop-only metric kind", () => {
    const form = read(CAPTURE_FORM);
    expect(form.includes('"url"')).toBe(true);
    expect(form.includes('"image"')).toBe(true);
    expect(form.includes('"text"')).toBe(true);
    // `metric` is the desktop inbox's fourth intake kind — never offered on mobile.
    expect(form.includes('"metric"'), "mobile capture must not offer the metric kind").toBe(false);
  });

  test("the capture page renders the capture form (and nothing heavier)", () => {
    const page = read(CAPTURE_PAGE);
    expect(page.includes("capture-form") || page.includes("CaptureForm")).toBe(true);
  });
});

describe("Story 2.5 — Codex review regressions", () => {
  test("[P2] the shared .pd-btn-outline rule lives in globally-loaded globals.css", () => {
    // The capture route imports only capture-form.css (not the desktop
    // evidence-inbox.css). Its submit button uses `pd-btn-outline`, so that rule
    // must live in globals.css (loaded by the root layout) or the button renders
    // unstyled on /capture. Guard against the rule regressing back into a
    // component-scoped sheet the capture route never loads.
    const globals = read("app/globals.css");
    expect(globals.includes(".pd-btn-outline")).toBe(true);
    expect(read(CAPTURE_FORM).includes("pd-btn-outline")).toBe(true);
    // It must NOT be defined only in the desktop-inbox sheet.
    expect(read("app/_components/evidence-inbox.css").includes(".pd-btn-outline {")).toBe(false);
  });

  test("[P2] the screenshot input does not force the camera capture flow", () => {
    // `capture="environment"` would open the rear camera instead of the photo/file
    // picker — wrong for an "Upload a screenshot" action (screenshots live in the
    // library, not behind the camera).
    expect(read(CAPTURE_FORM).includes("capture=")).toBe(false);
  });
});

describe("Story 2.5 — capture copy is present in both locales (i18n, UX-DR26)", () => {
  test.each([...LOCALES])("%s catalog carries a non-empty capture block", (locale) => {
    const c = localeStrings(locale).capture;
    expect(c.title.length).toBeGreaterThan(0);
    expect(c.lead.length).toBeGreaterThan(0);
    expect(c.action.url.length).toBeGreaterThan(0);
    expect(c.action.image.length).toBeGreaterThan(0);
    expect(c.action.text.length).toBeGreaterThan(0);
    expect(c.submit.length).toBeGreaterThan(0);
    expect(c.success.length).toBeGreaterThan(0);
    expect(c.error.length).toBeGreaterThan(0);
  });
});
