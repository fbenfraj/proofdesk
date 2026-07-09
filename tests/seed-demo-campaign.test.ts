import { beforeEach, describe, expect, test } from "vitest";
import { SEED_DEMO_CAMPAIGN_ID, type SeedSummary, seedDemoCampaign } from "@/seed/demo-campaign";
import {
  countMatchSuggestions,
  createTestDb,
  type DbHandle,
  getCampaign,
  getEvidenceItem,
  listEvidenceItems,
  listEvidenceLinks,
  listHumanConfirmations,
} from "@/src/repositories";

// Story 1.4 — the seed writes ONLY inputs. These tests assert the honesty
// invariants (AD-3, AD-9, AD-17, AD-18) and the three INPUT SHAPES designed to
// produce 7 Green · 1 Yellow · 1 Red — never a verdict (that engine is 1.5).

let handle: DbHandle;
let summary: SeedSummary;

beforeEach(() => {
  handle = createTestDb();
  summary = seedDemoCampaign(handle.db);
});

/** The critical proof-of-posting requirement summary for a Deliverable. */
function postingOf(key: string) {
  const d = summary.deliverables.find((x) => x.key === key);
  if (!d) throw new Error(`missing deliverable ${key}`);
  const posting = d.requirements.find((r) => r.kind === "proof-of-posting");
  if (!posting) throw new Error(`missing proof-of-posting for ${key}`);
  return { d, posting };
}

describe("seedDemoCampaign — structure (AC1, AC2)", () => {
  test("writes one seeded, is_demo Campaign at the stable id", () => {
    const campaign = getCampaign(handle.db, summary.campaignId);
    expect(campaign?.id).toBe(SEED_DEMO_CAMPAIGN_ID);
    expect(campaign?.dataOrigin).toBe("seeded");
    expect(campaign?.isDemo).toBe(true);
  });

  test("9 Deliverables, each with exactly one Claim and >=1 ProofRequirement", () => {
    expect(summary.deliverables).toHaveLength(9);
    for (const d of summary.deliverables) {
      expect(d.claimId).toBeTruthy();
      expect(d.requirements.length).toBeGreaterThanOrEqual(1);
      // Every Deliverable carries both critical requirements.
      const kinds = d.requirements.map((r) => r.kind);
      expect(kinds).toContain("proof-of-posting");
      expect(kinds).toContain("disclosure-visible");
    }
  });

  test("multiple Creators across a Twitch lane and a broader lane", () => {
    // 6 creators own 9 deliverables (3 own two).
    expect(summary.creators.length).toBeGreaterThan(1);
    const creatorsPerDeliverable = new Set(summary.deliverables.map((d) => d.creatorId));
    expect(creatorsPerDeliverable.size).toBe(summary.creators.length);
  });
});

describe("seedDemoCampaign — the 7G/1Y/1R input shapes (AC3)", () => {
  // Shape classification is done here from the raw inputs — the seed stores NO
  // verdict. A verdict-level assertion belongs to Story 1.5.
  const isGreenShape = (key: string) => {
    const { posting } = postingOf(key);
    return (
      posting.evidenceLinkCount >= 1 &&
      posting.humanConfirmationCount >= 1 &&
      posting.livenessLabels.includes("live")
    );
  };
  const isYellowShape = (key: string) => {
    const { posting } = postingOf(key);
    return (
      posting.humanConfirmationCount >= 1 &&
      posting.evidenceLinkCount >= 1 &&
      !posting.livenessLabels.includes("live")
    );
  };
  const isRedShape = (key: string) => {
    const { posting } = postingOf(key);
    return posting.evidenceLinkCount === 0 && posting.humanConfirmationCount === 0;
  };

  test("exactly 7 Deliverables have the Green input shape (live link + confirmation)", () => {
    const green = summary.deliverables.filter((d) => isGreenShape(d.key));
    expect(green).toHaveLength(7);
  });

  test("exactly 1 Deliverable has the Yellow shape (confirmed attestation, no live link)", () => {
    const yellow = summary.deliverables.filter((d) => isYellowShape(d.key));
    expect(yellow).toHaveLength(1);
    expect(yellow[0]?.type).toContain("Twitch");
  });

  test("exactly 1 Deliverable has the Red shape (no link, no confirmation)", () => {
    const red = summary.deliverables.filter((d) => isRedShape(d.key));
    expect(red).toHaveLength(1);
    expect(red[0]?.type).toBe("Instagram Story");
  });

  test("the three shapes partition all 9 Deliverables and match the documented intent", () => {
    for (const d of summary.deliverables) {
      const shapes = [isGreenShape(d.key), isYellowShape(d.key), isRedShape(d.key)];
      // Exactly one shape applies to each Deliverable.
      expect(shapes.filter(Boolean)).toHaveLength(1);
      const computed = isGreenShape(d.key) ? "green" : isYellowShape(d.key) ? "yellow" : "red";
      expect(computed).toBe(d.intendedVerdict);
    }
    const intents = summary.deliverables.map((d) => d.intendedVerdict);
    expect(intents.filter((v) => v === "green")).toHaveLength(7);
    expect(intents.filter((v) => v === "yellow")).toHaveLength(1);
    expect(intents.filter((v) => v === "red")).toHaveLength(1);
  });
});

describe("seedDemoCampaign — honesty invariants (AC4, AC5)", () => {
  test("every seeded child row carries data_origin = 'seeded' (AD-9)", () => {
    const items = listEvidenceItems(handle.db, summary.campaignId);
    const links = listEvidenceLinks(handle.db, summary.campaignId);
    const confirmations = listHumanConfirmations(handle.db, summary.campaignId);
    expect(items.length).toBeGreaterThan(0);
    expect(links.length).toBeGreaterThan(0);
    expect(confirmations.length).toBeGreaterThan(0);
    for (const row of [...items, ...links, ...confirmations]) {
      expect(row.dataOrigin).toBe("seeded");
    }
  });

  test("every verdict-feeding EvidenceLink is operator-sourced (AD-17)", () => {
    const links = listEvidenceLinks(handle.db, summary.campaignId);
    for (const link of links) {
      expect(link.source).toBe("operator");
    }
  });

  test("no MatchSuggestion is seeded as an audit input (AD-17)", () => {
    expect(countMatchSuggestions(handle.db, summary.campaignId)).toBe(0);
  });

  test("every HumanConfirmation has machine_or_human = 'human' (AD-18)", () => {
    const confirmations = listHumanConfirmations(handle.db, summary.campaignId);
    expect(confirmations.length).toBeGreaterThan(0);
    for (const hc of confirmations) {
      expect(hc.machineOrHuman).toBe("human");
    }
  });

  test("screenshot/metric evidence is written as a Human assertion (AD-19)", () => {
    const items = listEvidenceItems(handle.db, summary.campaignId);
    for (const item of items) {
      if (item.type === "disclosure-screenshot" || item.type === "metric-screenshot") {
        expect(item.machineOrHuman).toBe("human");
      }
    }
  });

  test("only the Green links persist a 'live' liveness; nothing is 'dead'/'blocked' (read back)", () => {
    const items = listEvidenceItems(handle.db, summary.campaignId);
    const live = items.filter((i) => i.livenessLabel === "live");
    // 7 Green Deliverables, one live proof-of-posting link each.
    expect(live).toHaveLength(7);
    for (const i of items) {
      expect(["live", null]).toContain(i.livenessLabel);
    }
    // Re-read one through the repository to confirm it truly persisted.
    const sample = getEvidenceItem(handle.db, live[0]?.id ?? "");
    expect(sample?.livenessLabel).toBe("live");
    expect(sample?.machineOrHuman).toBe("machine");
  });
});

describe("seedDemoCampaign — determinism", () => {
  test("re-seeding a fresh DB yields the same shape distribution", () => {
    const other = createTestDb();
    const s2 = seedDemoCampaign(other.db);
    expect(s2.deliverables.map((d) => d.intendedVerdict).sort()).toEqual(
      summary.deliverables.map((d) => d.intendedVerdict).sort(),
    );
    expect(s2.campaignId).toBe(summary.campaignId);
  });
});
