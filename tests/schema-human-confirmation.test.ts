import { beforeEach, describe, expect, test } from "vitest";
import {
  appendHumanConfirmation,
  assertHumanConfirmationIsHuman,
  createCampaign,
  createClient,
  createCreator,
  createDeliverable,
  createEvidenceItem,
  createEvidenceLink,
  createProofRequirement,
  createTestDb,
  type DbHandle,
  getHumanConfirmation,
  ProvenanceError,
} from "@/src/repositories";

// Chain down to an operator-affirmed EvidenceLink + its ProofRequirement so a
// HumanConfirmation can satisfy its foreign keys.
function seedForConfirmation(handle: DbHandle) {
  const { db } = handle;
  const c = createClient(db, "Acme");
  const campaign = createCampaign(db, {
    clientId: c.id,
    name: "Campaign 1",
    dataOrigin: "seeded",
    isDemo: true,
  });
  const creator = createCreator(db, campaign.id, "creator-1");
  const deliverable = createDeliverable(db, {
    campaignId: campaign.id,
    creatorId: creator.id,
    type: "ig-reel",
    claimedStatus: "done",
  });
  const req = createProofRequirement(db, {
    deliverableId: deliverable.id,
    kind: "proof-of-posting",
    criticality: "critical",
  });
  const item = createEvidenceItem(db, {
    campaignId: campaign.id,
    type: "link",
    machineOrHuman: "machine",
  });
  const link = createEvidenceLink(db, {
    evidenceItemId: item.id,
    proofRequirementId: req.id,
    source: "operator",
  });
  return { campaign, req, link };
}

describe("HumanConfirmation append-only + provenance (AD-18)", () => {
  let handle: DbHandle;
  beforeEach(() => {
    handle = createTestDb();
  });

  test("a confirmation derives its requirement + data_origin from the link and is 'human'", () => {
    const { req, link } = seedForConfirmation(handle);
    const hc = appendHumanConfirmation(handle.db, {
      evidenceLinkId: link.id,
      confirmedBy: "operator",
    });
    expect(hc.machineOrHuman).toBe("human");
    expect(hc.dataOrigin).toBe("seeded");
    // The requirement is taken from the link itself — never a caller-supplied
    // id that could point at a different requirement (AD-18).
    expect(hc.proofRequirementId).toBe(req.id);
  });

  test("the provenance guard rejects a non-human confirmation", () => {
    expect(() => assertHumanConfirmationIsHuman("machine")).toThrow(ProvenanceError);
  });

  test("an existing confirmation row is not mutated by a subsequent write", () => {
    const { link } = seedForConfirmation(handle);
    const first = appendHumanConfirmation(handle.db, {
      evidenceLinkId: link.id,
      confirmedBy: "operator",
      confirmedAt: "2026-07-09T00:00:00.000Z",
    });
    const before = getHumanConfirmation(handle.db, first.id);

    // A later write of any kind (here: a second confirmation) must leave the
    // first row byte-identical — there is no update/delete path (append-only).
    appendHumanConfirmation(handle.db, {
      evidenceLinkId: link.id,
      confirmedBy: "operator-2",
      confirmedAt: "2026-07-09T01:00:00.000Z",
    });

    expect(getHumanConfirmation(handle.db, first.id)).toEqual(before);
  });
});
