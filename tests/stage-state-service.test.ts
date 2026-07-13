import { beforeEach, describe, expect, test } from "vitest";
import { SEED_DEMO_CAMPAIGN_ID, seedDemoCampaign } from "@/seed/demo-campaign";
import {
  countEvidenceItems,
  createHumanOverride,
  createTestDb,
  type Db,
  type DbHandle,
} from "@/src/repositories";
import {
  createReport,
  EMPTY_STAGE_STATE,
  getCampaignBoard,
  resolveCampaignStageState,
  resolveEffectiveStatus,
} from "@/src/services";

const NOW = "2026-07-13T00:00:00.000Z";
let handle: DbHandle;
let db: Db;

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
  seedDemoCampaign(db);
});

function runAudit(): void {
  for (const row of getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID)) {
    resolveEffectiveStatus(db, row.claimId, NOW);
  }
}

describe("resolveCampaignStageState (AI-10 honest strip state)", () => {
  test("collect count mirrors countEvidenceItems", () => {
    const state = resolveCampaignStageState(db, SEED_DEMO_CAMPAIGN_ID);
    expect(state.collect.count).toBe(countEvidenceItems(db, SEED_DEMO_CAMPAIGN_ID));
  });

  test("audit is 'not run' (0 audited) before an audit, all-audited after", () => {
    expect(resolveCampaignStageState(db, SEED_DEMO_CAMPAIGN_ID).audit.audited).toBe(0);
    runAudit();
    const after = resolveCampaignStageState(db, SEED_DEMO_CAMPAIGN_ID);
    expect(after.audit.audited).toBe(after.audit.total);
    expect(after.audit.total).toBe(9); // seeded demo has 9 claims
  });

  test("setBar reports set-of-total from the proof brief", () => {
    const state = resolveCampaignStageState(db, SEED_DEMO_CAMPAIGN_ID);
    expect(state.setBar.total).toBeGreaterThan(0);
    expect(state.setBar.set).toBeLessThanOrEqual(state.setBar.total);
  });

  test("ship goes none -> ready -> stale (the load-bearing honesty case)", () => {
    expect(resolveCampaignStageState(db, SEED_DEMO_CAMPAIGN_ID).ship.kind).toBe("none");
    runAudit();
    createReport(db, SEED_DEMO_CAMPAIGN_ID, NOW);
    expect(resolveCampaignStageState(db, SEED_DEMO_CAMPAIGN_ID).ship.kind).toBe("ready");

    // Mutate effective status after the freeze -> the report must read stale,
    // never "ready" (retro AI-3 / Story 4-1 recompute-or-refuse).
    const red = getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID).find(
      (r) => r.status.kind === "resolved" && r.status.status === "red",
    );
    expect(red).toBeDefined();
    createHumanOverride(db, { claimId: red!.claimId, finalStatus: "green", authoredBy: "op" });
    expect(resolveCampaignStageState(db, SEED_DEMO_CAMPAIGN_ID).ship.kind).toBe("stale");
  });

  test("the audit signal carries no proof-verdict breakdown (honesty wall)", () => {
    const state = resolveCampaignStageState(db, SEED_DEMO_CAMPAIGN_ID);
    expect(Object.keys(state.audit).sort()).toEqual(["audited", "total"]);
  });

  test("EMPTY_STAGE_STATE is the all-zero fallback", () => {
    expect(EMPTY_STAGE_STATE.ship.kind).toBe("none");
    expect(EMPTY_STAGE_STATE.audit.total).toBe(0);
  });
});
