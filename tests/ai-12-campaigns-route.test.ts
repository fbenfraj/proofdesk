// POST /api/campaigns - the start-a-new-scenario route (Story AI-12, AD-2/AD-8).
// Thin shell: Zod-validate at the boundary, delegate to createScenario. Mirrors
// evidence-route.test.ts: point the process getDb() singleton at an in-memory DB,
// migrate once, then drive the exported POST with real Requests.

import { beforeAll, describe, expect, test } from "vitest";

process.env.DB_PATH = ":memory:";

import { POST } from "@/app/api/campaigns/route";
import { getDb, runMigrations } from "@/src/repositories";
import { listCampaigns } from "@/src/services";

beforeAll(() => {
  runMigrations(getDb());
});

function post(body: unknown): Request {
  return new Request("http://test.local/api/campaigns", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/campaigns", () => {
  test("creates a demo scenario and returns its id + name (201)", async () => {
    const before = listCampaigns(getDb().db).length;
    const res = await POST(post({ name: "Nike Q3" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(typeof json.id).toBe("string");
    expect(json.name).toBe("Nike Q3");
    expect(listCampaigns(getDb().db).length).toBe(before + 1);
  });

  test("rejects a malformed body with 400, writing nothing", async () => {
    const before = listCampaigns(getDb().db).length;
    const res = await POST(post({ name: 123 }));
    expect(res.status).toBe(400);
    expect(listCampaigns(getDb().db).length).toBe(before);
  });

  test("rejects a non-JSON body with 400", async () => {
    const res = await POST(
      new Request("http://test.local/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
