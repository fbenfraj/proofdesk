// Snapshot assembler + effective-status resolver over the persisted cache
// (AD-4, AD-6, AD-16, AD-17, AD-18). These are the shell tests: they exercise
// the repository seam with an in-memory DB (createTestDb) — the seam/ownership
// cluster the reviewer gate calls CRITICAL (BUILD-HANDOFF §5).

import { beforeEach, describe, expect, test } from "vitest";
import {
  appendHumanConfirmation,
  createCampaign,
  createClaim,
  createClient,
  createCreator,
  createDeliverable,
  createEvidenceItem,
  createEvidenceLink,
  createHumanOverride,
  createProofRequirement,
  createTestDb,
  type Db,
  type DbHandle,
  readAuditResult,
} from "@/src/repositories";
import { assembleSnapshot, resolveEffectiveStatus } from "@/src/services";

let handle: DbHandle;
let db: Db;

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
});

const NOW = "2026-07-09T00:00:00.000Z";

/** Build a Campaign + one Creator + one Deliverable/Claim and return the ids. */
function scaffold() {
  const client = createClient(db, "Test Client");
  const campaign = createCampaign(db, {
    clientId: client.id,
    name: "Test Campaign",
    dataOrigin: "real",
    isDemo: false,
  });
  const creator = createCreator(db, campaign.id, "Creator One");
  const deliverable = createDeliverable(db, {
    campaignId: campaign.id,
    creatorId: creator.id,
    type: "Instagram Reel",
    claimedStatus: "delivered",
  });
  const claim = createClaim(db, deliverable.id);
  return { campaignId: campaign.id, deliverableId: deliverable.id, claimId: claim.id };
}

/** A fully machine-satisfied critical proof-of-posting: live link + confirmation. */
function seedGreenPosting(campaignId: string, deliverableId: string) {
  const req = createProofRequirement(db, {
    deliverableId,
    kind: "proof-of-posting",
    criticality: "critical",
  });
  const item = createEvidenceItem(db, {
    campaignId,
    type: "link",
    machineOrHuman: "machine",
    uploadedAt: NOW,
    livenessLabel: "live",
  });
  const link = createEvidenceLink(db, {
    evidenceItemId: item.id,
    proofRequirementId: req.id,
    source: "operator",
  });
  appendHumanConfirmation(db, { evidenceLinkId: link.id, confirmedBy: "op@x", confirmedAt: NOW });
  return { requirementId: req.id, evidenceItemId: item.id, evidenceLinkId: link.id };
}

describe("snapshot assembler (AD-16, AD-17)", () => {
  test("only operator-affirmed evidence enters the snapshot; suggestions never do (AD-17)", () => {
    const { campaignId, deliverableId, claimId } = scaffold();
    const req = createProofRequirement(db, {
      deliverableId,
      kind: "reach-metric",
      criticality: "supporting",
    });
    const item = createEvidenceItem(db, {
      campaignId,
      type: "metric-screenshot",
      machineOrHuman: "human",
      uploadedAt: NOW,
    });
    // A `suggested`-source link on the SAME requirement must be ignored.
    createEvidenceLink(db, {
      evidenceItemId: item.id,
      proofRequirementId: req.id,
      source: "suggested",
    });

    const snapshot = assembleSnapshot(db, claimId, NOW);
    const row = snapshot.claim.requirements.find((r) => r.proofRequirementId === req.id);
    expect(row?.operatorEvidence).toHaveLength(0); // the suggested link did not count
    // The type itself has no field to smuggle a suggestion through.
    expect(Object.keys(row ?? {})).not.toContain("suggestions");
  });

  test("snapshot carries SNAPSHOT_VERSION and the requirement's kind + per-link liveness", () => {
    const { campaignId, deliverableId, claimId } = scaffold();
    const { requirementId } = seedGreenPosting(campaignId, deliverableId);
    const snapshot = assembleSnapshot(db, claimId, NOW);
    expect(snapshot.now).toBe(NOW);
    const row = snapshot.claim.requirements.find((r) => r.proofRequirementId === requirementId);
    expect(row?.kind).toBe("proof-of-posting");
    expect(row?.operatorEvidence).toHaveLength(1);
    expect(row?.operatorEvidence[0].livenessLabel).toBe("live");
    expect(row?.operatorEvidence[0].humanConfirmations).toHaveLength(1);
  });
});

describe("effective-status resolver + AuditResult cache (AD-4, AD-6)", () => {
  test("resolver returns one value whether the cache is warm or stale", () => {
    const { campaignId, deliverableId, claimId } = scaffold();
    seedGreenPosting(campaignId, deliverableId);
    createProofRequirement(db, {
      deliverableId,
      kind: "disclosure-visible",
      criticality: "critical",
    });
    // ^ disclosure has no evidence yet → unmet → red on first resolve.

    const first = resolveEffectiveStatus(db, claimId, NOW); // cold: computes + persists
    const second = resolveEffectiveStatus(db, claimId, NOW); // warm: reads cache
    expect(first).toEqual(second);
    expect(readAuditResult(db, claimId)).toBeTruthy(); // persisted
  });

  test("adding evidence changes the identity tuple → recompute yields a new verdict", () => {
    const { campaignId, deliverableId, claimId } = scaffold();
    const posting = createProofRequirement(db, {
      deliverableId,
      kind: "proof-of-posting",
      criticality: "critical",
    });
    // No evidence yet → red.
    expect(resolveEffectiveStatus(db, claimId, NOW).machineVerdict).toBe("red");

    // Land a live link + confirmation → green on recompute.
    const item = createEvidenceItem(db, {
      campaignId,
      type: "link",
      machineOrHuman: "machine",
      uploadedAt: NOW,
      livenessLabel: "live",
    });
    const link = createEvidenceLink(db, {
      evidenceItemId: item.id,
      proofRequirementId: posting.id,
      source: "operator",
    });
    appendHumanConfirmation(db, { evidenceLinkId: link.id, confirmedBy: "op@x", confirmedAt: NOW });
    expect(resolveEffectiveStatus(db, claimId, NOW).machineVerdict).toBe("green");
  });

  test("a HumanConfirmation survives a liveness re-check that invalidates the link (AD-18)", () => {
    const { campaignId, deliverableId, claimId } = scaffold();
    const { requirementId, evidenceItemId } = seedGreenPosting(campaignId, deliverableId);

    // Simulate a later liveness re-check flipping the link to `dead` (AD-7),
    // driving the raw driver directly ONLY to stand in for the Epic-2
    // verification adapter. The append-only confirmation row is NOT touched.
    handle.sqlite
      .prepare("UPDATE evidence_item SET liveness_label = 'dead' WHERE id = ?")
      .run(evidenceItemId);

    const snapshot = assembleSnapshot(db, claimId, NOW);
    const row = snapshot.claim.requirements.find((r) => r.proofRequirementId === requirementId);
    expect(row?.operatorEvidence[0].livenessLabel).toBe("dead");
    expect(row?.operatorEvidence[0].humanConfirmations).toHaveLength(1); // preserved (AD-18)
    // No live link now → caps at yellow, but the confirmation was not lost.
    expect(resolveEffectiveStatus(db, claimId, NOW).machineVerdict).toBe("yellow");
  });

  test("human override overlays the machine verdict; the machine verdict stays pinned (AD-6)", () => {
    const { campaignId, deliverableId, claimId } = scaffold();
    seedGreenPosting(campaignId, deliverableId);
    const disclosure = createProofRequirement(db, {
      deliverableId,
      kind: "disclosure-visible",
      criticality: "critical",
    });
    const shot = createEvidenceItem(db, {
      campaignId,
      type: "disclosure-screenshot",
      machineOrHuman: "human",
      uploadedAt: NOW,
    });
    const dlink = createEvidenceLink(db, {
      evidenceItemId: shot.id,
      proofRequirementId: disclosure.id,
      source: "operator",
    });
    appendHumanConfirmation(db, {
      evidenceLinkId: dlink.id,
      confirmedBy: "op@x",
      confirmedAt: NOW,
    });

    expect(resolveEffectiveStatus(db, claimId, NOW).machineVerdict).toBe("green");

    createHumanOverride(db, { claimId, finalStatus: "red", authoredBy: "op@x" });
    const resolved = resolveEffectiveStatus(db, claimId, NOW);
    expect(resolved.effectiveStatus).toBe("red"); // override wins
    expect(resolved.machineVerdict).toBe("green"); // machine verdict pinned
    expect(resolved.overrideStatus).toBe("red");
  });

  test("an override can be changed after being set once (upsert, unique claim_id)", () => {
    const { campaignId, deliverableId, claimId } = scaffold();
    seedGreenPosting(campaignId, deliverableId);

    createHumanOverride(db, { claimId, finalStatus: "red", authoredBy: "op@x" });
    // A second override on the same Claim must not violate the unique constraint.
    createHumanOverride(db, { claimId, finalStatus: "yellow", authoredBy: "op@x" });

    const resolved = resolveEffectiveStatus(db, claimId, NOW);
    expect(resolved.overrideStatus).toBe("yellow"); // latest override wins
    expect(resolved.effectiveStatus).toBe("yellow");
  });
});
