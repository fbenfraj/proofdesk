// The campaign audit-run orchestration (Story 1.7). `runCampaignAudit` is the
// service the "Run Proof Audit" Route Handler delegates to (AD-2: the route is
// thin; the service orchestrates). It drives the WRITE-capable resolver over
// every Claim in the campaign, persisting real verdicts (AD-9: real engine over
// seeded inputs), then returns the resolved board + the FR-15 roll-up + the run
// timestamp so the client can drive the reveal in one round-trip.

import { beforeEach, describe, expect, test } from "vitest";
import { SEED_DEMO_CAMPAIGN_ID, seedDemoCampaign } from "@/seed/demo-campaign";
import { createTestDb, type Db, type DbHandle, readAuditResult } from "@/src/repositories";
import { getCampaignBoard, runCampaignAudit } from "@/src/services";

const NOW = "2026-07-09T12:32:00.000Z";

let handle: DbHandle;
let db: Db;

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
  seedDemoCampaign(db);
});

describe("runCampaignAudit — the Run Proof Audit orchestration (Story 1.7)", () => {
  test("returns the resolved board, the 7·1·1 roll-up, and the run timestamp", () => {
    const result = runCampaignAudit(db, SEED_DEMO_CAMPAIGN_ID, NOW);
    expect(result.rows).toHaveLength(9);
    expect(result.rows.every((r) => r.status.kind === "resolved")).toBe(true);
    expect(result.readiness).toEqual({ green: 7, yellow: 1, red: 1, pending: 0, total: 9 });
    expect(result.ranAt).toBe(NOW);
  });

  test("persists an AuditResult for every Claim (the write-capable path)", () => {
    runCampaignAudit(db, SEED_DEMO_CAMPAIGN_ID, NOW);
    for (const row of getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID)) {
      expect(readAuditResult(db, row.claimId)).toBeDefined();
    }
  });

  test("a second run over unchanged evidence is idempotent (warm cache, AD-6)", () => {
    const first = runCampaignAudit(db, SEED_DEMO_CAMPAIGN_ID, NOW);
    const second = runCampaignAudit(db, SEED_DEMO_CAMPAIGN_ID, "2026-07-09T13:00:00.000Z");
    expect(second.readiness).toEqual(first.readiness);
    expect(second.readiness).toEqual({ green: 7, yellow: 1, red: 1, pending: 0, total: 9 });
  });
});
