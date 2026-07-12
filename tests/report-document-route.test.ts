// Story 4.3 — the GET /report/document Route Handler. Thin shell: it renders the
// latest report as a self-contained HTML document (text/html), 404s when there is
// no report, and resolves the locale from the request cookie (reusing 4.2's
// malformed-cookie safety — a bad cookie never 500s). It is the on-screen/preview
// artifact: NOT a `Content-Disposition: attachment` download and NOT demo-gated
// (both are Story 4.4). Uses the process getDb() singleton pointed at :memory:
// + the real seed (7 Green · 1 Yellow · 1 Red), like report-route.test.ts.

import { beforeAll, describe, expect, test } from "vitest";

process.env.DB_PATH = ":memory:";
process.env.OPERATOR_NAME = "ShellOperator";
process.env.OPERATOR_AGENCY = "Studio Kairos";

import { GET as documentGET } from "@/app/api/campaigns/[campaignId]/report/document/route";
import { SEED_DEMO_CAMPAIGN_ID, seedDemoCampaign } from "@/seed/demo-campaign";
import { getDb, runMigrations } from "@/src/repositories";
import { createReport } from "@/src/services";

function ctx(campaignId: string) {
  return { params: Promise.resolve({ campaignId }) };
}
function req(cookie?: string): Request {
  return new Request("http://test.local", cookie ? { headers: { cookie } } : undefined);
}

beforeAll(() => {
  const handle = getDb();
  runMigrations(handle);
  seedDemoCampaign(handle.db);
  // Freeze one report version so the document route has something to render.
  createReport(handle.db, SEED_DEMO_CAMPAIGN_ID, "2026-07-12T00:00:00.000Z");
});

describe("GET /api/campaigns/[campaignId]/report/document", () => {
  test("an unknown campaign (no report) is a clean 404", async () => {
    const res = await documentGET(req(), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  test("the seeded campaign renders a self-contained HTML document", async () => {
    const res = await documentGET(req(), ctx(SEED_DEMO_CAMPAIGN_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    // On-screen artifact — NOT a forced download (that is Story 4.4).
    expect(res.headers.get("content-disposition")).toBeNull();
    const html = await res.text();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    // 3-channel status stamps for the included (Green) claims.
    expect(html).toContain("DEFENSIBLE");
    // The trust footer's legal disclaimer travels verbatim.
    expect(html).toContain("not legal advice");
    // White-label — the agency identity is present.
    expect(html).toContain("Studio Kairos");
  });

  test("Red claims are absent, and a Yellow with no authored caveat is withheld (AD-6)", async () => {
    const res = await documentGET(req(), ctx(SEED_DEMO_CAMPAIGN_ID));
    const html = await res.text();
    // Red is excluded from the client view (AD-21) — its stamp label must not render.
    expect(html).not.toContain("CAN'T CLAIM");
    expect(html).not.toContain("NON DÉFENDABLE");
    // The seed authors NO caveat, so its lone effective-Yellow is not yet
    // client-includable — the client document never ships a Caveated claim bare.
    expect(html).not.toContain("CAVEATED");
  });

  test("the locale is resolved from the cookie — FR renders FR headings", async () => {
    const res = await documentGET(req("proofdesk_locale=fr"), ctx(SEED_DEMO_CAMPAIGN_ID));
    const html = await res.text();
    expect(html).toContain("Revendications");
    expect(html).toContain("Annexe de preuves");
  });

  test("a malformed locale cookie falls back to the default locale — never a 500", async () => {
    const res = await documentGET(req("proofdesk_locale=%E0%A4%A"), ctx(SEED_DEMO_CAMPAIGN_ID));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Claims"); // default EN heading
  });

  // Story 4.4 (AC4): the seeded campaign is `is_demo = true`, so its on-screen
  // document carries the SAMPLE marker — any Print/Save-as-PDF is unmistakable.
  test("a demo campaign's document carries the SAMPLE marker (AD-9)", async () => {
    const res = await documentGET(req(), ctx(SEED_DEMO_CAMPAIGN_ID));
    const html = await res.text();
    expect(html).toContain("Sample — not for client use");
  });
});
