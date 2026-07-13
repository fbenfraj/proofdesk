// Story AI-12 - live-demo add-flow services + the active-campaign resolver.
// createTestDb() gives a migrated in-memory DB (mirrors board-repository.test.ts).
// These pin: the switcher read, scenario creation (demo/seeded), Board item add
// (creator? + deliverable + 1:1 claim, pending by derivation), the empty-scenario
// robustness across surfaces, and the honesty rails.

import { describe, expect, test } from "vitest";
import { resolveActiveCampaignId } from "@/app/_lib/active-campaign";
import { SEED_DEMO_CAMPAIGN_ID, seedDemoCampaign } from "@/seed/demo-campaign";
import {
  createCampaign,
  createClient,
  createCreator,
  createTestDb,
  type Db,
  getCampaign,
  listCampaignBoardRows,
  listInboxEvidenceItems,
} from "@/src/repositories";
import {
  addDeliverableItem,
  createScenario,
  getCampaignBoard,
  getProofBrief,
  listCampaigns,
  resolveCampaignStageState,
} from "@/src/services";

function freshDb(): Db {
  return createTestDb().db;
}

function seededDb(): Db {
  const db = freshDb();
  seedDemoCampaign(db);
  return db;
}

describe("listCampaigns", () => {
  test("returns every campaign as {id,name,isDemo}, seeded demo first (creation order)", () => {
    const db = seededDb();
    const client = createClient(db, "Nike");
    createCampaign(db, { clientId: client.id, name: "Live 1", dataOrigin: "seeded", isDemo: true });
    const rows = listCampaigns(db);
    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe(SEED_DEMO_CAMPAIGN_ID);
    expect(rows[1].name).toBe("Live 1");
    for (const r of rows) {
      expect(typeof r.id).toBe("string");
      expect(typeof r.name).toBe("string");
      expect(typeof r.isDemo).toBe("boolean");
    }
  });
});

describe("createScenario", () => {
  test("creates an empty demo/seeded campaign and returns its id + name", () => {
    const db = freshDb();
    const { id, name } = createScenario(db, { name: "  Nike Q3 push  " });
    const row = getCampaign(db, id);
    expect(row?.isDemo).toBe(true);
    expect(row?.dataOrigin).toBe("seeded");
    expect(name).toBe("Nike Q3 push");
    expect(getCampaignBoard(db, id)).toEqual([]);
    expect(listCampaigns(db).map((c) => c.id)).toContain(id);
  });

  test("defaults the name when none is given (or blank)", () => {
    const db = freshDb();
    expect(createScenario(db, {}).name.length).toBeGreaterThan(0);
    expect(createScenario(db, { name: "   " }).name.length).toBeGreaterThan(0);
  });
});

describe("addDeliverableItem", () => {
  test("creates a new creator + deliverable + 1:1 claim; the row reads pending", () => {
    const db = freshDb();
    const { id: campaignId } = createScenario(db, { name: "S" });
    const out = addDeliverableItem(db, {
      campaignId,
      creator: { name: "PixelForge", handle: "pixelforge" },
      type: "Twitch sponsor segment",
    });
    expect(out.creatorId).toBeTruthy();
    expect(out.deliverableId).toBeTruthy();
    expect(out.claimId).toBeTruthy();
    const rows = listCampaignBoardRows(db, campaignId);
    expect(rows).toHaveLength(1);
    expect(rows[0].creatorName).toBe("PixelForge");
    expect(rows[0].creatorHandle).toBe("pixelforge");
    // Derived, never materialized (AD-4/AD-6): a fresh claim is pending.
    expect(getCampaignBoard(db, campaignId)[0].status.kind).toBe("pending");
  });

  test("reuses an existing creator when given { id }", () => {
    const db = freshDb();
    const { id: campaignId } = createScenario(db, { name: "S" });
    const creator = createCreator(db, campaignId, "NovaStream", "novastream");
    const out = addDeliverableItem(db, {
      campaignId,
      creator: { id: creator.id },
      type: "Twitch highlight",
    });
    expect(out.creatorId).toBe(creator.id);
    // No duplicate creator row: still one creator, now one deliverable.
    expect(listCampaignBoardRows(db, campaignId)).toHaveLength(1);
  });

  test("rejects an unknown campaign (throws)", () => {
    const db = freshDb();
    expect(() =>
      addDeliverableItem(db, { campaignId: "nope", creator: { name: "X" }, type: "t" }),
    ).toThrow();
  });
});

describe("resolveActiveCampaignId", () => {
  test("cookie absent -> seed fallback", () => {
    const db = seededDb();
    expect(resolveActiveCampaignId(db, undefined)).toBe(SEED_DEMO_CAMPAIGN_ID);
    expect(resolveActiveCampaignId(db, "")).toBe(SEED_DEMO_CAMPAIGN_ID);
  });
  test("cookie names a real campaign -> that campaign", () => {
    const db = seededDb();
    const { id } = createScenario(db, { name: "Live" });
    expect(resolveActiveCampaignId(db, id)).toBe(id);
  });
  test("cookie names a nonexistent campaign -> seed fallback (no throw)", () => {
    const db = seededDb();
    expect(resolveActiveCampaignId(db, "does-not-exist")).toBe(SEED_DEMO_CAMPAIGN_ID);
  });
});

describe("empty scenario renders across surfaces", () => {
  test("board, proof brief, inbox and stage-state all resolve for a zero-deliverable campaign", () => {
    const db = freshDb();
    const { id } = createScenario(db, { name: "Empty" });
    expect(getCampaignBoard(db, id)).toEqual([]);
    expect(() => getProofBrief(db, id)).not.toThrow();
    expect(() => listInboxEvidenceItems(db, id)).not.toThrow();
    expect(() => resolveCampaignStageState(db, id)).not.toThrow();
  });
});

describe("AI-12 honesty rails", () => {
  test("a live-built scenario is a non-exportable demo (is_demo=true, seeded)", () => {
    const db = freshDb();
    const { id } = createScenario(db, { name: "Live" });
    const row = getCampaign(db, id);
    expect(row?.isDemo).toBe(true); // export hard-wall stays closed (AD-9)
    expect(row?.dataOrigin).toBe("seeded");
  });

  test("a newly added claim reads pending (no fabricated verdict)", () => {
    const db = freshDb();
    const { id } = createScenario(db, { name: "Live" });
    addDeliverableItem(db, {
      campaignId: id,
      creator: { name: "PixelForge" },
      type: "Twitch sponsor segment",
    });
    const rows = getCampaignBoard(db, id);
    expect(rows).toHaveLength(1);
    expect(rows[0].status.kind).toBe("pending"); // AD-4/AD-6
  });
});
