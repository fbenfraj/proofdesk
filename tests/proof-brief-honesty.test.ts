import { beforeEach, describe, expect, test } from "vitest";
import {
  createCampaign,
  createClaim,
  createClient,
  createCreator,
  createDeliverable,
  createTestDb,
  type Db,
  type DbHandle,
} from "@/src/repositories";
import {
  addRequirement,
  assembleSnapshot,
  editRequirement,
  removeRequirement,
  resolveEffectiveStatus,
} from "@/src/services";
import { hashObject } from "@/src/services/hash";

let handle: DbHandle;
let db: Db;

function unsetDeliverable(): { campaignId: string; deliverableId: string; claimId: string } {
  const client = createClient(db, "Acme");
  const campaign = createCampaign(db, {
    clientId: client.id,
    name: "Spring Push",
    dataOrigin: "real",
    isDemo: false,
  });
  const creator = createCreator(db, campaign.id, "Nova");
  const deliverable = createDeliverable(db, {
    campaignId: campaign.id,
    creatorId: creator.id,
    type: "Twitch sponsor segment",
    claimedStatus: "delivered",
  });
  const claim = createClaim(db, deliverable.id);
  return { campaignId: campaign.id, deliverableId: deliverable.id, claimId: claim.id };
}

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
});

// AD-3 / AD-19: a screenshot/metric/viewer-figure kind is ALWAYS a Human
// assertion, and an unknown/custom kind falls to human-assertion. Authoring a
// requirement can never fabricate machine verification.
describe("capability honesty — no add path yields machine verification (AC5, AD-3/AD-19)", () => {
  test.each([
    "viewer-figure",
    "reach-screenshot",
    "metric-screenshot",
    "durable-capture",
    "a-totally-made-up-custom-kind",
  ])("a %s requirement resolves to a Human assertion", (kind) => {
    const { deliverableId } = unsetDeliverable();
    const result = addRequirement(db, deliverableId, {
      kind,
      criticality: "supporting",
      label: "figure",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.view.requirements[0].satisfactionType).toBe("human-assertion");
    }
  });

  test("only genuinely machine-eligible kinds map off human-assertion", () => {
    const { deliverableId } = unsetDeliverable();
    const link = addRequirement(db, deliverableId, {
      kind: "proof-of-posting",
      criticality: "critical",
      label: "link",
    });
    if (link.ok) expect(link.view.requirements[0].satisfactionType).toBe("link-reachability");
  });
});

// AD-4: the requirement set (kind + criticality) is part of AuditSnapshot.claim,
// so editing the bar changes evidence_snapshot_hash → the audit recomputes. A
// label-only edit is verdict-neutral and must NOT change the hash.
describe("cache invalidation flows through the snapshot hash (AC2.5, AD-4)", () => {
  test("a criticality edit changes the Claim's evidence_snapshot_hash", () => {
    const { deliverableId, claimId } = unsetDeliverable();
    const added = addRequirement(db, deliverableId, {
      kind: "reach-screenshot",
      criticality: "supporting",
      label: "Reach",
    });
    if (!added.ok) throw new Error("setup failed");
    const id = added.view.requirements[0].id;

    const before = hashObject(assembleSnapshot(db, claimId, "2026-07-11T00:00:00.000Z").claim);
    editRequirement(db, deliverableId, id, { criticality: "critical" });
    const after = hashObject(assembleSnapshot(db, claimId, "2026-07-11T00:00:00.000Z").claim);
    expect(after).not.toBe(before);
  });

  test("a label-only edit is verdict-neutral (hash unchanged)", () => {
    const { deliverableId, claimId } = unsetDeliverable();
    const added = addRequirement(db, deliverableId, {
      kind: "reach-screenshot",
      criticality: "supporting",
      label: "Reach",
    });
    if (!added.ok) throw new Error("setup failed");
    const id = added.view.requirements[0].id;

    const before = hashObject(assembleSnapshot(db, claimId, "2026-07-11T00:00:00.000Z").claim);
    editRequirement(db, deliverableId, id, { label: "Reach screenshot (updated wording)" });
    const after = hashObject(assembleSnapshot(db, claimId, "2026-07-11T00:00:00.000Z").claim);
    expect(after).toBe(before);
  });
});

// The UI promises "audits are blocked/meaningless until a bar exists" — the
// audit engine must honour that. Clearing the last requirement must never leave
// the Claim on a vacuous Green.
describe("an unset Deliverable never audits to a false Green (AC4)", () => {
  test("removing the last requirement makes the Claim audit Red, not Green", () => {
    const { deliverableId, claimId } = unsetDeliverable();
    const added = addRequirement(db, deliverableId, {
      kind: "reach-screenshot",
      criticality: "supporting",
      label: "Reach",
    });
    if (!added.ok) throw new Error("setup failed");
    const removed = removeRequirement(db, deliverableId, added.view.requirements[0].id);
    expect(removed.ok).toBe(true);
    if (removed.ok) expect(removed.view.isUnset).toBe(true);

    const status = resolveEffectiveStatus(db, claimId, "2026-07-11T00:00:00.000Z");
    expect(status.machineVerdict).toBe("red");
  });
});
