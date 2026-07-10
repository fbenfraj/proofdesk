// The Campaign Board view model (Story 1.6, AD-4/AD-6). Two invariants:
//   1. Before any audit has run, every row reads `pending` — and building the
//      pending board must NOT persist an AuditResult (no eager audit run; that is
//      Story 1.7's "Run Proof Audit").
//   2. Once results exist, rows carry the effective status (7 Green · 1 Yellow ·
//      1 Red for the seeded demo), read through the ONE resolver.

import { beforeEach, describe, expect, test } from "vitest";
import { SEED_DEMO_CAMPAIGN_ID, seedDemoCampaign } from "@/seed/demo-campaign";
import {
  createTestDb,
  type Db,
  type DbHandle,
  readAuditResult,
  upsertAuditResult,
} from "@/src/repositories";
import { getCampaignBoard, resolveEffectiveStatus } from "@/src/services";

const NOW = "2026-07-09T00:00:00.000Z";

let handle: DbHandle;
let db: Db;

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
  seedDemoCampaign(db);
});

describe("getCampaignBoard — pending before audit, resolved after (Story 1.6)", () => {
  test("every row is pending before any audit has run", () => {
    const board = getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID);
    expect(board).toHaveLength(9);
    expect(board.every((r) => r.status.kind === "pending")).toBe(true);
  });

  test("building the pending board does NOT run the audit (no AuditResult persisted)", () => {
    const board = getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID);
    for (const row of board) {
      expect(readAuditResult(db, row.claimId)).toBeUndefined();
    }
  });

  test("after the audit resolves, rows carry the effective status (7G · 1Y · 1R)", () => {
    // Story 1.7 drives this via the UI; here we persist results through the
    // resolver directly, then re-read the board.
    for (const row of getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID)) {
      resolveEffectiveStatus(db, row.claimId, NOW);
    }
    const tally = { green: 0, yellow: 0, red: 0, pending: 0 };
    for (const row of getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID)) {
      if (row.status.kind === "pending") tally.pending += 1;
      else tally[row.status.status] += 1;
    }
    expect(tally).toEqual({ green: 7, yellow: 1, red: 1, pending: 0 });
  });

  test("a stale cached result is NOT recomputed or rewritten by the board (read-only)", () => {
    const target = getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID)[0];
    // Poison the cache: a sentinel verdict the real audit would never produce for
    // this Green claim, under a deliberately stale identity tuple. If the board
    // recomputed, it would overwrite this with the real verdict + a fresh hash.
    upsertAuditResult(db, {
      claimId: target.claimId,
      machineVerdict: "red",
      trace: [],
      snapshotVersion: 0,
      rulesetVersion: "STALE",
      campaignOverrideHash: "stale",
      evidenceSnapshotHash: "stale",
    });

    const view = getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID).find(
      (r) => r.claimId === target.claimId,
    );
    // The board returns the PERSISTED (stale) verdict — it did not recompute...
    expect(view?.status).toEqual({ kind: "resolved", status: "red" });
    // ...and it did not rewrite the cache row (identity hash left untouched).
    expect(readAuditResult(db, target.claimId)?.evidenceSnapshotHash).toBe("stale");
  });
});
