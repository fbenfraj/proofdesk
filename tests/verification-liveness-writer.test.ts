// The liveness writer + its AD-18 guard (Story 2.4). `updateEvidenceLiveness`
// persists the four-value label and its audit trail (raw status, final URL,
// reason, server-UTC checkedAt) onto the EvidenceItem — and NOTHING else.
//
// The load-bearing test is AD-18: a liveness re-check may invalidate the *link*
// but must NEVER mutate or delete a HumanConfirmation, nor smear `machine`
// provenance onto that human-written row. We build a confirmed `live` posting,
// re-check it to `dead`, and assert the confirmation row is byte-identical.

import { describe, expect, test } from "vitest";
import {
  appendHumanConfirmation,
  createCampaign,
  createClaim,
  createClient,
  createCreator,
  createDeliverable,
  createEvidenceItem,
  createEvidenceLink,
  createProofRequirement,
  createTestDb,
  type Db,
  getEvidenceItem,
  listHumanConfirmations,
  updateEvidenceLiveness,
} from "@/src/repositories";

/** A REAL campaign with a `live`, operator-affirmed, human-CONFIRMED posting —
 *  the exact pre-state a liveness re-check acts on. */
function seedConfirmedPosting(db: Db) {
  const client = createClient(db, "Acme");
  const campaign = createCampaign(db, {
    clientId: client.id,
    name: "Real Campaign",
    dataOrigin: "real",
    isDemo: false,
  });
  const creator = createCreator(db, campaign.id, "Nova", "nova");
  const deliverable = createDeliverable(db, {
    campaignId: campaign.id,
    creatorId: creator.id,
    type: "Twitch sponsor segment",
    claimedStatus: "delivered",
    platformUrl: "https://twitch.tv/nova/seg",
  });
  createClaim(db, deliverable.id);
  const req = createProofRequirement(db, {
    deliverableId: deliverable.id,
    kind: "proof-of-posting",
    criticality: "critical",
  });
  const item = createEvidenceItem(db, {
    campaignId: campaign.id,
    type: "link",
    machineOrHuman: "machine",
    intakeKind: "url",
    url: "https://twitch.tv/nova/seg",
    uploadedAt: "2026-05-12T20:11:00.000Z",
    livenessLabel: "live",
  });
  const link = createEvidenceLink(db, {
    evidenceItemId: item.id,
    proofRequirementId: req.id,
    source: "operator",
  });
  const confirmation = appendHumanConfirmation(db, {
    evidenceLinkId: link.id,
    confirmedBy: "camille@studio-kairos.example",
    confirmedAt: "2026-07-10T09:00:00.000Z",
  });
  return { campaignId: campaign.id, evidenceItemId: item.id, confirmation };
}

describe("updateEvidenceLiveness (Story 2.4)", () => {
  test("persists the label + full audit trail on the EvidenceItem", () => {
    const { db } = createTestDb();
    const { evidenceItemId } = seedConfirmedPosting(db);

    const updated = updateEvidenceLiveness(db, evidenceItemId, {
      label: "blocked",
      status: "403",
      finalUrl: "https://twitch.tv/nova/seg",
      reason: "http-403",
      checkedAt: "2026-07-10T12:00:00.000Z",
    });

    expect(updated).toMatchObject({
      id: evidenceItemId,
      livenessLabel: "blocked",
      livenessStatus: "403",
      livenessFinalUrl: "https://twitch.tv/nova/seg",
      livenessReason: "http-403",
      livenessCheckedAt: "2026-07-10T12:00:00.000Z",
    });
  });

  test("returns undefined for an unknown EvidenceItem id", () => {
    const { db } = createTestDb();
    expect(updateEvidenceLiveness(db, "does-not-exist", { label: "dead" })).toBeUndefined();
  });

  test("AD-18: re-checking to `dead` leaves the HumanConfirmation byte-identical", () => {
    const { db } = createTestDb();
    const { campaignId, evidenceItemId, confirmation } = seedConfirmedPosting(db);

    const before = listHumanConfirmations(db, campaignId);
    expect(before).toHaveLength(1);

    // A machine re-check invalidates the link's liveness…
    updateEvidenceLiveness(db, evidenceItemId, {
      label: "dead",
      status: "404",
      finalUrl: "https://twitch.tv/nova/seg",
      reason: "http-404",
      checkedAt: "2026-07-11T00:00:00.000Z",
    });

    expect(getEvidenceItem(db, evidenceItemId)?.livenessLabel).toBe("dead");

    // …but the human confirmation row is untouched: same row, same values,
    // still `human` provenance (AD-18).
    const after = listHumanConfirmations(db, campaignId);
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual(before[0]);
    expect(after[0].id).toBe(confirmation.id);
    expect(after[0].machineOrHuman).toBe("human");
  });
});
