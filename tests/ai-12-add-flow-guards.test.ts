// Story AI-12 - structural guards for the two live add-flow client components.
// Vitest runs in the `node` environment (no jsdom/testing-library), so these are
// static source guards (mirroring capture-surface.test.ts): they pin the seams
// that matter - the endpoints posted to, the cookie written, the i18n strings
// used, and the honesty rail that the switcher chrome carries NO proof verdict.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { LOCALES, localeStrings } from "@/app/_lib/i18n";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string): string => readFileSync(`${REPO_ROOT}${rel}`, "utf8");

const SWITCHER = "app/_components/campaign-switcher.tsx";
const ADD_DELIVERABLE = "app/_components/add-deliverable.tsx";
const APP_SHELL = "app/_components/app-shell.tsx";

describe("CampaignSwitcher (start a new scenario, switch)", () => {
  const src = read(SWITCHER);

  test("posts to /api/campaigns to start a new scenario", () => {
    expect(src).toContain('fetch("/api/campaigns"');
    expect(src).toMatch(/method:\s*"POST"/);
  });

  test("writes the active-campaign cookie (mirrors LangToggle) then hard-reloads", () => {
    expect(src).toContain("CAMPAIGN_COOKIE");
    expect(src).toContain("document.cookie");
    // A hard navigation (not router.refresh) so per-scenario client state never
    // bleeds across a switch/start (see the component comments).
    expect(src).toMatch(/window\.location\.(assign|reload)\(/);
  });

  test("is verdict-free chrome: renders no proof-status UI", () => {
    // The single proof signal stays on the Board + report, never the nav (AI-10).
    // Checked structurally (not by prose) so honest comments can name the rule:
    // the switcher imports no status tokens and renders no status stamp.
    expect(src).not.toContain("PROOF_STATUS");
    expect(src).not.toContain("StatusStamp");
    expect(src).not.toContain("pd-stamp");
  });

  test("the real switcher replaces the placeholder in AppShell", () => {
    const shell = read(APP_SHELL);
    expect(shell).toContain("CampaignSwitcher");
    // The old placeholder chrome (campaignPlaceholder) is gone from the shell.
    expect(shell).not.toContain("campaignPlaceholder");
  });
});

describe("AddDeliverable (add an item on the Board)", () => {
  const src = read(ADD_DELIVERABLE);

  test("posts to the campaign-scoped deliverables route", () => {
    // Split so the assertion string carries no ${...} template literal itself.
    expect(src).toContain("/api/campaigns/");
    expect(src).toContain("/deliverables`");
    expect(src).toMatch(/method:\s*"POST"/);
  });

  test("refreshes after a successful add so the new row appears", () => {
    expect(src).toContain("router.refresh()");
  });

  test("the posted body carries only creator/type/platformUrl (no status/verdict)", () => {
    // Honesty: claimedStatus is set server-side to 'delivered'; renders no status
    // UI. Checked on the actual fetch body + imports, not on prose comments.
    const body = src.slice(
      src.indexOf("body: JSON.stringify"),
      src.indexOf("body: JSON.stringify") + 120,
    );
    expect(body).toContain("creator");
    expect(body).toContain("type");
    expect(body).toContain("platformUrl");
    expect(body).not.toContain("claimedStatus");
    expect(src).not.toContain("PROOF_STATUS");
    expect(src).not.toContain("StatusStamp");
  });
});

describe("i18n strings for the add-flows exist in every locale", () => {
  for (const locale of LOCALES) {
    test(`${locale} has scenario + addDeliverable copy`, () => {
      const s = localeStrings(locale);
      expect(s.scenario.startNew.length).toBeGreaterThan(0);
      expect(s.scenario.label.length).toBeGreaterThan(0);
      expect(s.addDeliverable.open.length).toBeGreaterThan(0);
      expect(s.addDeliverable.submit.length).toBeGreaterThan(0);
    });
  }
});
