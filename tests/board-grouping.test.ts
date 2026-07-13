// AI-11 - the Board groups its ledger rows by Creator (the primary organizing
// unit). groupBoardByCreator is a pure, order-preserving, single-pass grouping
// over already-contiguous rows (see board-repository ordering). Keyed on
// creatorId so a shared display name still forms two groups.

import { beforeEach, describe, expect, test } from "vitest";
import { groupBoardByCreator } from "@/app/_lib/board-grouping";
import { SEED_DEMO_CAMPAIGN_ID, seedDemoCampaign } from "@/seed/demo-campaign";
import { createTestDb, type Db, type DbHandle } from "@/src/repositories";
import { type BoardRowView, getCampaignBoard } from "@/src/services";

// A minimal BoardRowView factory for the pure-logic cases.
function row(creatorId: string, creatorName: string, claimId: string): BoardRowView {
  return {
    claimId,
    deliverableId: `${claimId}-d`,
    creatorId,
    creatorName,
    creatorHandle: null,
    deliverableType: "Instagram Reel",
    claimedStatus: "delivered",
    status: { kind: "pending" },
  };
}

describe("groupBoardByCreator (AI-11)", () => {
  test("empty input yields no groups", () => {
    expect(groupBoardByCreator([])).toEqual([]);
  });

  test("one group per creator, in first-seen order, rows preserved", () => {
    const rows = [row("a", "Ana", "1"), row("a", "Ana", "2"), row("b", "Bo", "3")];
    const groups = groupBoardByCreator(rows);
    expect(groups.map((g) => g.creatorId)).toEqual(["a", "b"]);
    expect(groups[0].rows.map((r) => r.claimId)).toEqual(["1", "2"]);
    expect(groups[1].rows.map((r) => r.claimId)).toEqual(["3"]);
  });

  test("two creators sharing a display name but different id form two groups", () => {
    const rows = [row("a", "Alex", "1"), row("b", "Alex", "2")];
    const groups = groupBoardByCreator(rows);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.creatorId)).toEqual(["a", "b"]);
  });

  test("flattening the groups preserves the input claim order and total", () => {
    const rows = [row("a", "Ana", "1"), row("a", "Ana", "2"), row("b", "Bo", "3")];
    const flat = groupBoardByCreator(rows).flatMap((g) => g.rows.map((r) => r.claimId));
    expect(flat).toEqual(["1", "2", "3"]);
  });
});

describe("groupBoardByCreator over the seeded board", () => {
  let handle: DbHandle;
  let db: Db;
  beforeEach(() => {
    handle = createTestDb();
    db = handle.db;
    seedDemoCampaign(db);
  });

  test("the 9 seeded deliverables group into the 6 seeded creators", () => {
    const groups = groupBoardByCreator(getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID));
    expect(groups).toHaveLength(6);
    // Every group's rows share the group's creatorId, and the total is preserved.
    for (const g of groups) {
      expect(g.rows.every((r) => r.creatorId === g.creatorId)).toBe(true);
    }
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(9);
    // First creator alphabetically is Camille Dubois (matches the ledger order).
    expect(groups[0].creatorName).toBe("Camille Dubois");
  });
});
