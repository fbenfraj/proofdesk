import { beforeEach, describe, expect, test } from "vitest";
import {
  createCampaign,
  createCaveat,
  createClaim,
  createClient,
  createCreator,
  createDeliverable,
  createEvidenceItem,
  createEvidenceLink,
  createProofRequirement,
  createTestDb,
  type DbHandle,
  getCampaign,
  ImmutableFieldError,
  MixedOriginError,
  updateCampaign,
} from "@/src/repositories";

// Build a Campaign + the parent chain down to a Claim so we can write an
// exportable child (Caveat) whose data_origin must be inherited (AD-9).
function seedChain(handle: DbHandle, dataOrigin: "seeded" | "real") {
  const { db } = handle;
  const c = createClient(db, "Acme");
  const campaign = createCampaign(db, {
    clientId: c.id,
    name: "Campaign 1",
    dataOrigin,
    isDemo: dataOrigin === "seeded",
  });
  const creator = createCreator(db, campaign.id, "creator-1");
  const deliverable = createDeliverable(db, {
    campaignId: campaign.id,
    creatorId: creator.id,
    type: "ig-reel",
    claimedStatus: "done",
  });
  const claim = createClaim(db, deliverable.id);
  return { campaign, claim };
}

describe("data_origin hard wall (AD-9)", () => {
  let handle: DbHandle;
  beforeEach(() => {
    handle = createTestDb();
  });

  test.each([
    ["seeded" as const],
    ["real" as const],
  ])("data_origin is inherited onto a derived row from the Campaign (%s)", (origin) => {
    const { campaign, claim } = seedChain(handle, origin);
    // The caller does NOT pass data_origin or a campaignId — both are derived
    // from the Claim's actual parent chain (the single derivation site).
    const caveat = createCaveat(handle.db, {
      claimId: claim.id,
      text: "operator note",
      authoredBy: "operator",
    });
    expect(caveat.dataOrigin).toBe(origin);
    expect(caveat.dataOrigin).toBe(campaign.dataOrigin);
  });

  test("a supplied data_origin that disagrees with the parent is rejected", () => {
    const { claim } = seedChain(handle, "seeded");
    expect(() =>
      createCaveat(handle.db, {
        claimId: claim.id,
        text: "operator note",
        authoredBy: "operator",
        dataOrigin: "real", // disagrees with the seeded parent
      }),
    ).toThrow(MixedOriginError);
  });

  test("a cross-campaign evidence link is rejected at write time (AD-9)", () => {
    const { db } = handle;
    const c = createClient(db, "Acme");
    const seeded = createCampaign(db, {
      clientId: c.id,
      name: "Seeded",
      dataOrigin: "seeded",
      isDemo: true,
    });
    const real = createCampaign(db, {
      clientId: c.id,
      name: "Real",
      dataOrigin: "real",
      isDemo: false,
    });
    // Evidence item lives in the seeded campaign...
    const item = createEvidenceItem(db, {
      campaignId: seeded.id,
      type: "link",
      machineOrHuman: "machine",
    });
    // ...but the requirement lives in the real campaign.
    const creator = createCreator(db, real.id, "creator-1");
    const deliverable = createDeliverable(db, {
      campaignId: real.id,
      creatorId: creator.id,
      type: "ig-reel",
      claimedStatus: "done",
    });
    const req = createProofRequirement(db, {
      deliverableId: deliverable.id,
      kind: "proof-of-posting",
      criticality: "critical",
    });
    expect(() =>
      createEvidenceLink(db, {
        evidenceItemId: item.id,
        proofRequirementId: req.id,
        source: "operator",
      }),
    ).toThrow(MixedOriginError);
  });

  test.each([
    ["dataOrigin", { dataOrigin: "real" }],
    ["isDemo", { isDemo: false }],
  ])("Campaign.%s is immutable", (_field, patch) => {
    const { campaign } = seedChain(handle, "seeded");
    expect(() => updateCampaign(handle.db, campaign.id, patch)).toThrow(ImmutableFieldError);
  });

  test("a mutable Campaign field (name) can still be updated", () => {
    const { campaign } = seedChain(handle, "seeded");
    updateCampaign(handle.db, campaign.id, { name: "renamed" });
    expect(getCampaign(handle.db, campaign.id)?.name).toBe("renamed");
  });

  test("updateCampaign never rewrites non-whitelisted columns (e.g. clientId)", () => {
    const { db } = handle;
    const owner = createClient(db, "Owner");
    const campaign = createCampaign(db, {
      clientId: owner.id,
      name: "Campaign 1",
      dataOrigin: "seeded",
      isDemo: true,
    });
    const otherClient = createClient(db, "Someone Else");
    // A stray clientId in the patch must NOT change campaign ownership.
    updateCampaign(db, campaign.id, { name: "renamed", clientId: otherClient.id });
    const after = getCampaign(db, campaign.id);
    expect(after?.name).toBe("renamed");
    expect(after?.clientId).toBe(owner.id);
  });

  test("a Deliverable with a Creator from another Campaign is rejected (AD-9)", () => {
    const { db } = handle;
    const c = createClient(db, "Acme");
    const campaignA = createCampaign(db, {
      clientId: c.id,
      name: "A",
      dataOrigin: "seeded",
      isDemo: true,
    });
    const campaignB = createCampaign(db, {
      clientId: c.id,
      name: "B",
      dataOrigin: "real",
      isDemo: false,
    });
    const creatorB = createCreator(db, campaignB.id, "creator-b");
    expect(() =>
      createDeliverable(db, {
        campaignId: campaignA.id, // declares campaign A...
        creatorId: creatorB.id, // ...but the creator belongs to B
        type: "ig-reel",
        claimedStatus: "done",
      }),
    ).toThrow(MixedOriginError);
  });
});
