// Proof-Readiness roll-up (Story 1.7, FR-15). `summarizeReadiness` is a PURE
// tally over the board view model's already-resolved statuses (AD-6) — it never
// runs the audit itself and holds no clock. Two invariants pinned here:
//   1. Before any audit has run, every row is pending → { pending: 9 }.
//   2. After the audit resolves the seeded demo, the roll-up is the magic-moment
//      multiset { green: 7, yellow: 1, red: 1 } — the real engine over seeded
//      inputs (AD-9), asserted end-to-end through the resolver + board + counter.

import { beforeEach, describe, expect, test } from "vitest";
import { SEED_DEMO_CAMPAIGN_ID, seedDemoCampaign } from "@/seed/demo-campaign";
import { createTestDb, type Db, type DbHandle } from "@/src/repositories";
import {
  type BoardRowView,
  getCampaignBoard,
  resolveEffectiveStatus,
  summarizeReadiness,
} from "@/src/services";

const NOW = "2026-07-09T00:00:00.000Z";

let handle: DbHandle;
let db: Db;

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
  seedDemoCampaign(db);
});

function runFullAudit(): void {
  for (const row of getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID)) {
    resolveEffectiveStatus(db, row.claimId, NOW);
  }
}

describe("summarizeReadiness — the FR-15 roll-up (Story 1.7)", () => {
  test("pure function: is a plain tally with no side effects", () => {
    const rows: BoardRowView[] = [
      {
        claimId: "a",
        deliverableId: "",
        creatorName: "",
        deliverableType: "",
        claimedStatus: "",
        status: { kind: "resolved", status: "green" },
      },
      {
        claimId: "b",
        deliverableId: "",
        creatorName: "",
        deliverableType: "",
        claimedStatus: "",
        status: { kind: "resolved", status: "yellow" },
      },
      {
        claimId: "c",
        deliverableId: "",
        creatorName: "",
        deliverableType: "",
        claimedStatus: "",
        status: { kind: "pending" },
      },
    ];
    expect(summarizeReadiness(rows)).toEqual({ green: 1, yellow: 1, red: 0, pending: 1, total: 3 });
  });

  test("before any audit runs, every seeded row is pending (9 pending, 0 resolved)", () => {
    const summary = summarizeReadiness(getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID));
    expect(summary).toEqual({ green: 0, yellow: 0, red: 0, pending: 9, total: 9 });
  });

  test("after a full run, the roll-up is the magic-moment multiset 7·1·1", () => {
    runFullAudit();
    const summary = summarizeReadiness(getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID));
    expect(summary).toEqual({ green: 7, yellow: 1, red: 1, pending: 0, total: 9 });
  });

  test("a re-run over unchanged evidence is idempotent — same 7·1·1 (warm cache, AD-6)", () => {
    runFullAudit();
    runFullAudit(); // second pass hits the warm cache; must not shift the counts
    const summary = summarizeReadiness(getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID));
    expect(summary).toEqual({ green: 7, yellow: 1, red: 1, pending: 0, total: 9 });
  });

  test("empty board yields an all-zero roll-up", () => {
    expect(summarizeReadiness([])).toEqual({ green: 0, yellow: 0, red: 0, pending: 0, total: 0 });
  });
});
