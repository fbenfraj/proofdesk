// The "page shows the Deliverable" confirmation write orchestration (Story 2.3,
// AD-5/AD-17/AD-18). `confirmDeliverablePage` is the operator entry point: it
// appends an immutable HumanConfirmation against ONE of the Claim's
// operator-affirmed links and returns the refreshed READ-ONLY Claim Card view.
// Invariants under test:
//   1. The write appends a `machine_or_human = human` row keyed to the link's
//      ProofRequirement, with the shell-resolved operator + server clock (AD-11).
//   2. Only a `source = operator` link on THIS Claim can be confirmed — a
//      suggested link, a foreign-Claim link, or an unknown id yields null (→ 404),
//      so a suggestion can never be lifted into a confirmation (AD-17).
//   3. Confirmation is append-only: a second confirm writes a SECOND row; nothing
//      is ever mutated (AD-18).
//   4. The write NEVER runs the audit (AD-6) — read/write discipline.

import { beforeEach, describe, expect, test } from "vitest";
import { seedDemoCampaign } from "@/seed/demo-campaign";
import {
  createCampaign,
  createClaim,
  createClient,
  createCreator,
  createDeliverable,
  createEvidenceItem,
  createEvidenceLink,
  createMatchSuggestion,
  createProofRequirement,
  createTestDb,
  type Db,
  type DbHandle,
  listHumanConfirmations,
  readAuditResult,
} from "@/src/repositories";
import { confirmDeliverablePage } from "@/src/services";

let handle: DbHandle;
let db: Db;

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
});

/** A minimal REAL campaign: one Deliverable with one critical proof-of-posting
 *  requirement backed by a `live` operator link that is NOT yet confirmed. This
 *  is the exact pre-state Story 2.3 acts on. Returns the ids the tests need. */
function seedUnconfirmedPosting(opts: { live?: boolean } = {}) {
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
    livenessLabel: opts.live === false ? undefined : "live",
  });
  const link = createEvidenceLink(db, {
    evidenceItemId: item.id,
    proofRequirementId: req.id,
    source: "operator",
  });
  return {
    campaignId: campaign.id,
    claimId: claim.id,
    proofRequirementId: req.id,
    evidenceLinkId: link.id,
    evidenceItemId: item.id,
  };
}

describe("confirmDeliverablePage (Story 2.3, AD-18) — the write", () => {
  test("appends a human confirmation keyed to the link's requirement, server-stamped", () => {
    const f = seedUnconfirmedPosting();
    const view = confirmDeliverablePage(db, {
      claimId: f.claimId,
      evidenceLinkId: f.evidenceLinkId,
      confirmedBy: "camille@studio-kairos.example",
      confirmedAt: "2026-07-10T09:00:00.000Z",
    });
    expect(view).not.toBeNull();

    const rows = listHumanConfirmations(db, f.campaignId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      evidenceLinkId: f.evidenceLinkId,
      proofRequirementId: f.proofRequirementId, // derived from the link, not passed
      confirmedBy: "camille@studio-kairos.example",
      confirmedAt: "2026-07-10T09:00:00.000Z",
      machineOrHuman: "human", // forced (AD-18)
      dataOrigin: "real", // inherited from the campaign (AD-9)
    });
  });

  test("surfaces the confirmation in the returned Claim Card view (single round-trip)", () => {
    const f = seedUnconfirmedPosting();
    const view = confirmDeliverablePage(db, {
      claimId: f.claimId,
      evidenceLinkId: f.evidenceLinkId,
      confirmedBy: "op",
      confirmedAt: "2026-07-10T09:00:00.000Z",
    });
    const req = view?.requirements.find((r) => r.proofRequirementId === f.proofRequirementId);
    const ev = req?.evidence.find((e) => e.evidenceLinkId === f.evidenceLinkId);
    expect(ev?.confirmations).toEqual([
      { confirmedBy: "op", confirmedAt: "2026-07-10T09:00:00.000Z" },
    ]);
  });

  test("is append-only: a second confirm writes a SECOND row, never a mutation (AD-18)", () => {
    const f = seedUnconfirmedPosting();
    confirmDeliverablePage(db, {
      claimId: f.claimId,
      evidenceLinkId: f.evidenceLinkId,
      confirmedBy: "op-a",
      confirmedAt: "2026-07-10T09:00:00.000Z",
    });
    confirmDeliverablePage(db, {
      claimId: f.claimId,
      evidenceLinkId: f.evidenceLinkId,
      confirmedBy: "op-b",
      confirmedAt: "2026-07-10T10:00:00.000Z",
    });
    const rows = listHumanConfirmations(db, f.campaignId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.confirmedBy).sort()).toEqual(["op-a", "op-b"]);
  });

  test("NEVER runs the audit — no AuditResult is written by the confirm path (AD-6)", () => {
    const f = seedUnconfirmedPosting();
    confirmDeliverablePage(db, {
      claimId: f.claimId,
      evidenceLinkId: f.evidenceLinkId,
      confirmedBy: "op",
      confirmedAt: "2026-07-10T09:00:00.000Z",
    });
    expect(readAuditResult(db, f.claimId)).toBeUndefined();
  });
});

describe("confirmDeliverablePage — the honesty guards (AD-17)", () => {
  test("returns null for a non-existent Claim (→ 404)", () => {
    const f = seedUnconfirmedPosting();
    expect(
      confirmDeliverablePage(db, {
        claimId: "nope",
        evidenceLinkId: f.evidenceLinkId,
        confirmedBy: "op",
        confirmedAt: "2026-07-10T09:00:00.000Z",
      }),
    ).toBeNull();
  });

  test("returns null for an unknown EvidenceLink id — nothing is written", () => {
    const f = seedUnconfirmedPosting();
    const out = confirmDeliverablePage(db, {
      claimId: f.claimId,
      evidenceLinkId: "no-such-link",
      confirmedBy: "op",
      confirmedAt: "2026-07-10T09:00:00.000Z",
    });
    expect(out).toBeNull();
    expect(listHumanConfirmations(db, f.campaignId)).toHaveLength(0);
  });

  test("cannot confirm a link that belongs to a DIFFERENT Claim", () => {
    const a = seedUnconfirmedPosting();
    const b = seedUnconfirmedPosting();
    const out = confirmDeliverablePage(db, {
      claimId: a.claimId,
      evidenceLinkId: b.evidenceLinkId, // b's link, a's claim
      confirmedBy: "op",
      confirmedAt: "2026-07-10T09:00:00.000Z",
    });
    expect(out).toBeNull();
    expect(listHumanConfirmations(db, a.campaignId)).toHaveLength(0);
    expect(listHumanConfirmations(db, b.campaignId)).toHaveLength(0);
  });

  test("cannot confirm a `suggested` link — only operator links (AD-17)", () => {
    // Build a claim whose posting requirement is backed ONLY by a suggested link.
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
      livenessLabel: "live",
    });
    const suggested = createEvidenceLink(db, {
      evidenceItemId: item.id,
      proofRequirementId: req.id,
      source: "suggested",
    });
    createMatchSuggestion(db, { evidenceItemId: item.id, proofRequirementId: req.id, rule: "x" });

    const out = confirmDeliverablePage(db, {
      claimId: claim.id,
      evidenceLinkId: suggested.id,
      confirmedBy: "op",
      confirmedAt: "2026-07-10T09:00:00.000Z",
    });
    expect(out).toBeNull();
    expect(listHumanConfirmations(db, campaign.id)).toHaveLength(0);
  });

  test("cannot confirm a link on a non-proof-of-posting requirement (AC1)", () => {
    // A screenshot/metric requirement is a Human assertion (AD-19), not a page a
    // confirmation attests. Even a legitimate operator link on it must be rejected
    // by the SERVICE — the drawer never offers this, but a direct API call could.
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
      kind: "reach-metric", // → human-assertion, NOT link-reachability
      criticality: "supporting",
    });
    const item = createEvidenceItem(db, {
      campaignId: campaign.id,
      type: "metric-screenshot",
      machineOrHuman: "human",
      uploadedAt: "2026-05-12T20:15:00.000Z",
    });
    const link = createEvidenceLink(db, {
      evidenceItemId: item.id,
      proofRequirementId: req.id,
      source: "operator",
    });

    const out = confirmDeliverablePage(db, {
      claimId: claim.id,
      evidenceLinkId: link.id,
      confirmedBy: "op",
      confirmedAt: "2026-07-10T09:00:00.000Z",
    });
    expect(out).toBeNull();
    expect(listHumanConfirmations(db, campaign.id)).toHaveLength(0);
  });

  test("does not disturb a fully-seeded demo campaign's existing confirmations", () => {
    // Guardrail: confirming a bad id on a rich graph writes nothing.
    const seed = seedDemoCampaign(db);
    const before = listHumanConfirmations(db, seed.campaignId).length;
    confirmDeliverablePage(db, {
      claimId: seed.deliverables[0].claimId,
      evidenceLinkId: "no-such-link",
      confirmedBy: "op",
      confirmedAt: "2026-07-10T09:00:00.000Z",
    });
    expect(listHumanConfirmations(db, seed.campaignId)).toHaveLength(before);
  });
});
