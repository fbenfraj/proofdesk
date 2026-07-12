import { beforeEach, describe, expect, test } from "vitest";
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
  listProofRequirementsForDeliverable,
} from "@/src/repositories";
import { DELIVERABLE_TYPE, defaultRequirementsFor } from "@/src/ruleset";
import {
  addRequirement,
  applyTemplate,
  editRequirement,
  getProofBrief,
  listTemplates,
  removeRequirement,
} from "@/src/services";

let handle: DbHandle;
let db: Db;

// A minimal real campaign with ONE unset Deliverable (no requirements yet) — the
// kickoff state the Proof Brief opens in. Returns the ids the tests author against.
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

describe("getProofBrief — the read (Story 3.2, FR-3)", () => {
  test("returns null for an unknown Campaign (→ 404 at the route)", () => {
    expect(getProofBrief(db, "no-such-campaign")).toBeNull();
  });

  test("an authored-nothing Deliverable reads as proof-brief-unset", () => {
    const { campaignId, deliverableId } = unsetDeliverable();
    const brief = getProofBrief(db, campaignId);
    expect(brief).not.toBeNull();
    const d = brief?.deliverables.find((x) => x.deliverableId === deliverableId);
    expect(d?.isUnset).toBe(true);
    expect(d?.requirements).toEqual([]);
  });

  test("templates cover all five Deliverable types with honest per-requirement confirmation", () => {
    const templates = listTemplates();
    expect(templates.map((t) => t.deliverableType).sort()).toEqual([...DELIVERABLE_TYPE].sort());
    for (const t of templates) {
      // Set-level adopted (GATE b/3 retired) — NOT a claim that every member is grounded.
      expect(t.provisional).toBe(false);
      // The legally-sourced disclosure critical is confirmed in every template.
      const disclosure = t.requirements.find((r) => r.kind === "disclosure-visible");
      expect(disclosure?.criticality).toBe("critical");
      expect(disclosure?.confirmed).toBe(true);
    }
    // Confirmation is per-requirement: the two AI-2 demotions surface as
    // confirmed=false through the template view (the UI renders them provisional).
    const reel = templates.find((t) => t.deliverableType === "instagram-reel");
    expect(reel?.requirements.find((r) => r.kind === "reach-screenshot")?.confirmed).toBe(false);
    const twitch = templates.find((t) => t.deliverableType === "twitch-sponsor-segment");
    expect(twitch?.requirements.find((r) => r.kind === "channel-match")?.confirmed).toBe(false);
  });
});

describe("applyTemplate — prefill from the Story-3.1 default set (AC1)", () => {
  test.each(DELIVERABLE_TYPE)("%s pre-fills exactly its default set as rows", (type) => {
    const { deliverableId } = unsetDeliverable();
    const result = applyTemplate(db, deliverableId, type);
    expect(result.ok).toBe(true);
    const expected = defaultRequirementsFor(type).requirements;
    const rows = listProofRequirementsForDeliverable(db, deliverableId);
    // Membership, not order — the read is ordered by id (deterministic UUID),
    // and the audit re-sorts anyway; what matters is the exact set of bars.
    const byKind = (list: readonly { kind: string; criticality: string }[]) =>
      [...list].map((r) => `${r.kind}:${r.criticality}`).sort();
    expect(byKind(rows)).toEqual(byKind(expected));
    // The critical France/EU disclosure came across.
    expect(rows.some((r) => r.kind === "disclosure-visible" && r.criticality === "critical")).toBe(
      true,
    );
    if (result.ok) expect(result.view.isUnset).toBe(false);
  });

  test("applying a template twice is rejected (already-set), never doubles the bar", () => {
    const { deliverableId } = unsetDeliverable();
    expect(applyTemplate(db, deliverableId, "tiktok").ok).toBe(true);
    const second = applyTemplate(db, deliverableId, "tiktok");
    expect(second).toEqual({ ok: false, reason: "already-set" });
    // Row count unchanged — no accidental duplication.
    expect(listProofRequirementsForDeliverable(db, deliverableId)).toHaveLength(
      defaultRequirementsFor("tiktok").requirements.length,
    );
  });

  test("apply-template on an unknown Deliverable is a clean not-found", () => {
    expect(applyTemplate(db, "no-such-deliverable", "tiktok")).toEqual({
      ok: false,
      reason: "deliverable-not-found",
    });
  });
});

describe("add / edit / remove — free authoring per Deliverable (AC2)", () => {
  test("add appends a requirement and the returned view reflects it", () => {
    const { deliverableId } = unsetDeliverable();
    const result = addRequirement(db, deliverableId, {
      kind: "proof-of-posting",
      criticality: "critical",
      label: "Clip link resolves",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.view.isUnset).toBe(false);
      expect(result.view.requirements).toHaveLength(1);
      expect(result.view.requirements[0]).toMatchObject({
        kind: "proof-of-posting",
        criticality: "critical",
        label: "Clip link resolves",
      });
    }
  });

  test("edit changes criticality/label in place, keeping the row id stable", () => {
    const { deliverableId } = unsetDeliverable();
    const added = addRequirement(db, deliverableId, {
      kind: "reach-screenshot",
      criticality: "supporting",
      label: "Reach screenshot",
    });
    if (!added.ok) throw new Error("setup failed");
    const id = added.view.requirements[0].id;
    const edited = editRequirement(db, deliverableId, id, {
      criticality: "critical",
      label: "Reach (required)",
    });
    expect(edited.ok).toBe(true);
    if (edited.ok) {
      expect(edited.view.requirements[0].id).toBe(id);
      expect(edited.view.requirements[0].criticality).toBe("critical");
      expect(edited.view.requirements[0].label).toBe("Reach (required)");
    }
  });

  test("edit / remove of an unknown requirement is a clean not-found", () => {
    const { deliverableId } = unsetDeliverable();
    expect(editRequirement(db, deliverableId, "nope", { criticality: "critical" })).toEqual({
      ok: false,
      reason: "requirement-not-found",
    });
    expect(removeRequirement(db, deliverableId, "nope")).toEqual({
      ok: false,
      reason: "requirement-not-found",
    });
  });

  test("a requirement can only be mutated through its OWN Deliverable's route (scoping)", () => {
    const a = unsetDeliverable();
    const b = unsetDeliverable();
    const added = addRequirement(db, a.deliverableId, {
      kind: "reach-screenshot",
      criticality: "supporting",
      label: "Reach",
    });
    if (!added.ok) throw new Error("setup failed");
    const id = added.view.requirements[0].id;
    // Editing/removing A's requirement through B's route id → not-found, never a
    // silent cross-Deliverable mutation.
    expect(editRequirement(db, b.deliverableId, id, { criticality: "critical" })).toEqual({
      ok: false,
      reason: "requirement-not-found",
    });
    expect(removeRequirement(db, b.deliverableId, id)).toEqual({
      ok: false,
      reason: "requirement-not-found",
    });
    // A's requirement is untouched.
    expect(listProofRequirementsForDeliverable(db, a.deliverableId)[0].criticality).toBe(
      "supporting",
    );
  });

  test("remove deletes an unreferenced requirement", () => {
    const { deliverableId } = unsetDeliverable();
    const added = addRequirement(db, deliverableId, {
      kind: "channel-match",
      criticality: "supporting",
      label: "Channel matches",
    });
    if (!added.ok) throw new Error("setup failed");
    const id = added.view.requirements[0].id;
    const removed = removeRequirement(db, deliverableId, id);
    expect(removed.ok).toBe(true);
    expect(listProofRequirementsForDeliverable(db, deliverableId)).toHaveLength(0);
  });
});

describe("the delete hazard — never orphan linked evidence (AC6)", () => {
  test("removing a requirement with a dependent EvidenceLink is REJECTED", () => {
    const { campaignId, deliverableId } = unsetDeliverable();
    const req = createProofRequirement(db, {
      deliverableId,
      kind: "proof-of-posting",
      criticality: "critical",
      label: "Link resolves",
    });
    const item = createEvidenceItem(db, {
      campaignId,
      type: "url",
      machineOrHuman: "human",
      intakeKind: "url",
      url: "https://twitch.tv/pixelforge/clip/x",
    });
    createEvidenceLink(db, {
      evidenceItemId: item.id,
      proofRequirementId: req.id,
      source: "operator",
    });

    const result = removeRequirement(db, deliverableId, req.id);
    expect(result).toEqual({ ok: false, reason: "has-dependents" });
    // The requirement (and thus the evidence link) is still intact.
    expect(listProofRequirementsForDeliverable(db, deliverableId).map((r) => r.id)).toContain(
      req.id,
    );
  });

  test("a requirement with ONLY a machine MatchSuggestion is still deletable (suggestions cleared)", () => {
    const { campaignId, deliverableId } = unsetDeliverable();
    const req = createProofRequirement(db, {
      deliverableId,
      kind: "proof-of-posting",
      criticality: "critical",
      label: "Link resolves",
    });
    const item = createEvidenceItem(db, {
      campaignId,
      type: "url",
      machineOrHuman: "human",
      intakeKind: "url",
      url: "https://twitch.tv/pixelforge/clip/x",
    });
    // A suggestion is machine output (AD-17) with no operator meaning and no
    // clear-UI — it must never make a requirement undeletable.
    createMatchSuggestion(db, {
      evidenceItemId: item.id,
      proofRequirementId: req.id,
      rule: "url:twitch.tv/pixelforge",
    });

    const result = removeRequirement(db, deliverableId, req.id);
    expect(result.ok).toBe(true);
    expect(listProofRequirementsForDeliverable(db, deliverableId)).toHaveLength(0);
  });
});
