// The Report Route Handlers (Story 4.1, AD-2/AD-8/AD-20/AD-21). The routes are a
// thin shell: parse at the boundary, guard the parent, resolve the operator
// identity in the shell (NOT from the body), delegate to the already-tested
// service, and shape the HTTP response. These tests assert the shell contract:
//   1. An unknown Campaign is a clean 404 — never a write-time FK 500.
//   2. POST freezes a new version and returns the builder view (201).
//   3. GET returns 404 before any report exists, then the latest builder view.
//   4. Including a Red claim with no Caveat is a 409 (RedInclusionWithoutCaveat).
//   5. `overriddenBy` is server-resolved — never taken from the request body.
//
// The routes call the process `getDb()` singleton; we point it at an in-memory DB
// (DB_PATH=":memory:") and seed it once. Handlers are invoked directly with a
// Request + the Next 16 `ctx.params` promise.

import { beforeAll, describe, expect, test } from "vitest";

process.env.DB_PATH = ":memory:";
process.env.OPERATOR_NAME = "ShellOperator";

import {
  GET as reportGET,
  POST as reportPOST,
} from "@/app/api/campaigns/[campaignId]/report/route";
import { PATCH as itemPATCH } from "@/app/api/reports/[reportId]/items/[itemId]/route";
import { SEED_DEMO_CAMPAIGN_ID, seedDemoCampaign } from "@/seed/demo-campaign";
import { getDb, runMigrations } from "@/src/repositories";

function campaignCtx(campaignId: string) {
  return { params: Promise.resolve({ campaignId }) };
}
function itemCtx(reportId: string, itemId: string) {
  return { params: Promise.resolve({ reportId, itemId }) };
}
function patchRequest(body: unknown): Request {
  return new Request("http://test.local", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  const handle = getDb();
  runMigrations(handle);
  seedDemoCampaign(handle.db);
});

describe("POST /api/campaigns/[campaignId]/report — parent guard + freeze", () => {
  test("an unknown campaign is a clean 404, not a 500", async () => {
    const res = await reportPOST(
      new Request("http://test.local", { method: "POST" }),
      campaignCtx("does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  test("freezes a new version and returns the builder view (201)", async () => {
    const res = await reportPOST(
      new Request("http://test.local", { method: "POST" }),
      campaignCtx(SEED_DEMO_CAMPAIGN_ID),
    );
    expect(res.status).toBe(201);
    const view = await res.json();
    expect(view.version).toBe(1);
    expect(view.stale).toBe(false);
    // Seed is 7 Green · 1 Yellow · 1 Red → 8 client-visible, 1 internal-only.
    expect(view.clientVisible.length + view.internalOnly.length).toBe(9);
    expect(view.internalOnly).toHaveLength(1);
  });
});

describe("GET /api/campaigns/[campaignId]/report — latest builder view", () => {
  test("404 for a campaign with no report", async () => {
    const res = await reportGET(new Request("http://test.local"), campaignCtx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  test("returns the latest builder view once one exists", async () => {
    const res = await reportGET(
      new Request("http://test.local"),
      campaignCtx(SEED_DEMO_CAMPAIGN_ID),
    );
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.campaignId).toBe(SEED_DEMO_CAMPAIGN_ID);
  });
});

describe("PATCH /api/reports/[reportId]/items/[itemId] — inclusion override", () => {
  test("including a Red claim with no caveat is a 409", async () => {
    // Freeze a fresh report and find its internal-only (Red) item.
    const created = await reportPOST(
      new Request("http://test.local", { method: "POST" }),
      campaignCtx(SEED_DEMO_CAMPAIGN_ID),
    );
    const view = await created.json();
    const redItem = view.internalOnly[0];
    const res = await itemPATCH(
      patchRequest({ inclusion: "included" }),
      itemCtx(view.reportId, redItem.reportItemId),
    );
    expect(res.status).toBe(409);
  });

  test("an invalid inclusion value is rejected at the boundary (400)", async () => {
    const res = await itemPATCH(patchRequest({ inclusion: "maybe" }), itemCtx("r", "i"));
    expect(res.status).toBe(400);
  });

  test("excluding a client-visible claim succeeds (200) and records the shell operator", async () => {
    const created = await reportPOST(
      new Request("http://test.local", { method: "POST" }),
      campaignCtx(SEED_DEMO_CAMPAIGN_ID),
    );
    const view = await created.json();
    const greenItem = view.clientVisible[0];
    // A forged `overriddenBy` in the body must be ignored (server-resolved).
    const res = await itemPATCH(
      patchRequest({ inclusion: "excluded", overriddenBy: "forged" }),
      itemCtx(view.reportId, greenItem.reportItemId),
    );
    expect(res.status).toBe(200);
    const updated = await res.json();
    const moved = updated.internalOnly.find(
      (i: { reportItemId: string }) => i.reportItemId === greenItem.reportItemId,
    );
    expect(moved.overriddenBy).toBe("ShellOperator");
  });
});
