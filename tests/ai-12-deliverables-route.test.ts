// POST /api/campaigns/[campaignId]/deliverables - the add-a-Board-item route
// (Story AI-12, AD-2/AD-8). Zod-validate at the boundary, delegate to
// addDeliverableItem. Unknown campaign -> 404. In-memory singleton DB, migrated
// once (mirrors evidence-route.test.ts).

import { beforeAll, describe, expect, test } from "vitest";

process.env.DB_PATH = ":memory:";

import { POST } from "@/app/api/campaigns/[campaignId]/deliverables/route";
import { getDb, listCampaignBoardRows, runMigrations } from "@/src/repositories";
import { createScenario } from "@/src/services";

beforeAll(() => {
  runMigrations(getDb());
});

function ctx(campaignId: string) {
  return { params: Promise.resolve({ campaignId }) };
}

function post(body: unknown): Request {
  return new Request("http://test.local/api/campaigns/x/deliverables", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/campaigns/[campaignId]/deliverables", () => {
  test("adds a deliverable with a new creator (201) and the row appears", async () => {
    const { id } = createScenario(getDb().db, { name: "S" });
    const res = await POST(
      post({
        creator: { name: "PixelForge", handle: "pixelforge" },
        type: "Twitch sponsor segment",
      }),
      ctx(id),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.deliverableId).toBeTruthy();
    expect(json.claimId).toBeTruthy();
    expect(json.creatorId).toBeTruthy();
    const rows = listCampaignBoardRows(getDb().db, id);
    expect(rows).toHaveLength(1);
    expect(rows[0].creatorName).toBe("PixelForge");
  });

  test("rejects a malformed body with 400", async () => {
    const { id } = createScenario(getDb().db, { name: "S" });
    const res = await POST(post({ type: "" }), ctx(id));
    expect(res.status).toBe(400);
  });

  test("returns 404 for an unknown campaign", async () => {
    const res = await POST(post({ creator: { name: "X" }, type: "t" }), ctx("nope"));
    expect(res.status).toBe(404);
  });
});
