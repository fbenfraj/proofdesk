// The Campaign Board read (Story 1.6). listCampaignBoardRows joins
// Claim ⋈ Deliverable ⋈ Creator into the ledger rows, ordered deterministically.
// Status is NOT read here (that is the board service) — this pins the join shape,
// the claimed marker, and the stable ordering.

import { beforeEach, describe, expect, test } from "vitest";
import { SEED_DEMO_CAMPAIGN_ID, seedDemoCampaign } from "@/seed/demo-campaign";
import { createTestDb, type Db, type DbHandle, listCampaignBoardRows } from "@/src/repositories";

let handle: DbHandle;
let db: Db;

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
  seedDemoCampaign(db);
});

describe("listCampaignBoardRows — the claimed-vs-proven ledger read (Story 1.6)", () => {
  test("returns one row per seeded Deliverable (9)", () => {
    expect(listCampaignBoardRows(db, SEED_DEMO_CAMPAIGN_ID)).toHaveLength(9);
  });

  test("each row carries claim id, creator name, deliverable type and claimed marker", () => {
    for (const row of listCampaignBoardRows(db, SEED_DEMO_CAMPAIGN_ID)) {
      expect(row.claimId).toBeTruthy();
      expect(row.deliverableId).toBeTruthy();
      expect(row.creatorName.length).toBeGreaterThan(0);
      expect(row.deliverableType.length).toBeGreaterThan(0);
      // Every seeded Deliverable is human-marked delivered (9/9 claimed).
      expect(row.claimedStatus).toBe("delivered");
    }
  });

  test("each row carries the creator id and (nullable) handle", () => {
    for (const row of listCampaignBoardRows(db, SEED_DEMO_CAMPAIGN_ID)) {
      expect(typeof row.creatorId).toBe("string");
      expect(row.creatorId.length).toBeGreaterThan(0);
      // handle is nullable in the schema; seeded creators all have one.
      expect(row.creatorHandle === null || typeof row.creatorHandle === "string").toBe(true);
    }
  });

  test("all rows for a given creator are contiguous (groupable in one linear pass)", () => {
    const rows = listCampaignBoardRows(db, SEED_DEMO_CAMPAIGN_ID);
    const runsSeen = new Set<string>();
    let prev: string | null = null;
    for (const row of rows) {
      if (row.creatorId !== prev) {
        // Entering a new run for this creator: it must not have appeared earlier.
        expect(runsSeen.has(row.creatorId)).toBe(false);
        runsSeen.add(row.creatorId);
        prev = row.creatorId;
      }
    }
  });

  test("the seeded creators and types are present", () => {
    const rows = listCampaignBoardRows(db, SEED_DEMO_CAMPAIGN_ID);
    const creators = new Set(rows.map((r) => r.creatorName));
    expect(creators.has("Camille Dubois")).toBe(true);
    expect(creators.has("PixelForge")).toBe(true);
    expect(rows.map((r) => r.deliverableType)).toContain("Instagram Story");
  });

  test("ordering is deterministic and alphabetical by creator", () => {
    const first = listCampaignBoardRows(db, SEED_DEMO_CAMPAIGN_ID);
    const second = listCampaignBoardRows(db, SEED_DEMO_CAMPAIGN_ID);
    expect(first.map((r) => r.claimId)).toEqual(second.map((r) => r.claimId));
    const names = first.map((r) => r.creatorName);
    expect(names[0]).toBe("Camille Dubois"); // 'C' — first alphabetically
    expect(names[names.length - 1]).toBe("Théo Blanc"); // 'T' — last
  });

  test("an unknown campaign yields no rows", () => {
    expect(listCampaignBoardRows(db, "does-not-exist")).toHaveLength(0);
  });
});
