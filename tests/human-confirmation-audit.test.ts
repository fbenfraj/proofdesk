// Story 2.3 end-to-end honesty: how a written HumanConfirmation flows through the
// snapshot assembler + pure core into a verdict, and how it survives a later
// liveness re-check (AD-5, AD-18). These are the invariants the schema/service
// unit tests can't see because they need the REAL audit:
//   AC3 — proof-of-posting is Green ONLY with BOTH a `live` link AND a
//         confirmation on that same link. A live link alone → not Green; a
//         confirmation alone (no live link) → not Green.
//   AD-18 — a liveness re-check may invalidate the LINK (drop the verdict) but
//         NEVER mutates or wipes the confirmation row. `honesty-anchor.test.ts`
//         explicitly defers this "survives re-check" test to Epic 2.
//
// The Story-2.4 SSRF link-checker (the real re-check writer) does not exist yet,
// so we simulate exactly what it will do — flip an EvidenceItem's liveness label
// — with one direct driver write. That is a stand-in for an EXTERNAL mutation, not
// a read helper; every assertion still reads through the repository/service seam.

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import {
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
  type DbHandle,
  getHumanConfirmation,
  listHumanConfirmations,
} from "@/src/repositories";
import { evidenceItem, type LivenessLabel } from "@/src/schema";
import { confirmDeliverablePage, resolveEffectiveStatus } from "@/src/services";

const NOW = "2026-07-10T00:00:00.000Z";

let handle: DbHandle;
let db: Db;

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
});

/** A REAL campaign with ONE critical proof-of-posting requirement backed by an
 *  operator link. `live` controls the link's machine reachability. No
 *  confirmation is written — that is what Story 2.3 adds. */
function seedPosting(opts: { live: boolean }) {
  const client = createClient(db, "Acme");
  const campaign = createCampaign(db, {
    clientId: client.id,
    name: "Real",
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
  const claim = createClaim(db, deliverable.id);
  const req = createProofRequirement(db, {
    deliverableId: deliverable.id,
    kind: "proof-of-posting",
    criticality: "critical",
  });
  const item = createEvidenceItem(db, {
    campaignId: campaign.id,
    type: "link",
    machineOrHuman: "machine",
    uploadedAt: "2026-05-12T20:11:00.000Z",
    livenessLabel: opts.live ? "live" : undefined,
  });
  const link = createEvidenceLink(db, {
    evidenceItemId: item.id,
    proofRequirementId: req.id,
    source: "operator",
  });
  return {
    campaignId: campaign.id,
    claimId: claim.id,
    evidenceItemId: item.id,
    evidenceLinkId: link.id,
  };
}

/** Simulate the Story-2.4 liveness re-check: flip the EvidenceItem's label. */
function setLiveness(evidenceItemId: string, label: LivenessLabel) {
  db.update(evidenceItem)
    .set({ livenessLabel: label })
    .where(eq(evidenceItem.id, evidenceItemId))
    .run();
}

describe("proof-of-posting satisfaction through the write path (AC3, AD-5)", () => {
  test("a LIVE link with NO confirmation never reaches Green", () => {
    const f = seedPosting({ live: true });
    const before = resolveEffectiveStatus(db, f.claimId, NOW);
    expect(before.machineVerdict).not.toBe("green"); // reachability alone ≠ proof
  });

  test("confirming a LIVE link lifts the Claim to Green (cache recomputes)", () => {
    const f = seedPosting({ live: true });
    resolveEffectiveStatus(db, f.claimId, NOW); // persist the pre-confirmation verdict
    confirmDeliverablePage(db, {
      claimId: f.claimId,
      evidenceLinkId: f.evidenceLinkId,
      confirmedBy: "op",
      confirmedAt: NOW,
    });
    // The confirmation changed the snapshot, so the AuditResult cache is stale and
    // the resolver recomputes — live + confirmed ⇒ Green.
    const after = resolveEffectiveStatus(db, f.claimId, NOW);
    expect(after.machineVerdict).toBe("green");
  });

  test("a confirmation with NO live link never reaches Green (caps at Yellow)", () => {
    const f = seedPosting({ live: false });
    confirmDeliverablePage(db, {
      claimId: f.claimId,
      evidenceLinkId: f.evidenceLinkId,
      confirmedBy: "op",
      confirmedAt: NOW,
    });
    const after = resolveEffectiveStatus(db, f.claimId, NOW);
    expect(after.machineVerdict).toBe("yellow"); // met on the creator's word only
  });
});

describe("a HumanConfirmation survives a liveness re-check (AD-18)", () => {
  test("the re-check invalidates the LINK (Green → Yellow) but never touches the confirmation row", () => {
    const f = seedPosting({ live: true });
    confirmDeliverablePage(db, {
      claimId: f.claimId,
      evidenceLinkId: f.evidenceLinkId,
      confirmedBy: "op",
      confirmedAt: NOW,
    });
    expect(resolveEffectiveStatus(db, f.claimId, NOW).machineVerdict).toBe("green");

    const hcId = listHumanConfirmations(db, f.campaignId)[0].id;
    const rowBefore = getHumanConfirmation(db, hcId);

    // A later re-check finds the URL now 404s → the LINK is invalidated.
    setLiveness(f.evidenceItemId, "dead");

    // The verdict drops (no machine reachability now) …
    expect(resolveEffectiveStatus(db, f.claimId, NOW).machineVerdict).toBe("yellow");
    // … but the confirmation row is byte-identical — never wiped or mutated.
    expect(getHumanConfirmation(db, hcId)).toEqual(rowBefore);
    expect(listHumanConfirmations(db, f.campaignId)).toHaveLength(1);
  });
});
