// Story 3.3 — France/EU disclosure checklist + three-tier severity, end to end
// through the shell (service → assembler → pure core). Proves: attaching a
// disclosure requirement, the tier flowing into the AuditSnapshot, the tier
// driving the verdict (Green-eligible / Yellow / Red), cache invalidation via the
// snapshot hash (AD-4), the derived display cap, scoping/kind guards, and that an
// override lifts a disclosure-driven verdict like any other (FR-10).

import { beforeEach, describe, expect, test } from "vitest";
import {
  createCampaign,
  createClaim,
  createClient,
  createCreator,
  createDeliverable,
  createHumanOverride,
  createTestDb,
  type Db,
  type DbHandle,
} from "@/src/repositories";
import {
  addDisclosureRequirement,
  addRequirement,
  applyTemplate,
  assembleSnapshot,
  editRequirement,
  resolveEffectiveStatus,
  setDisclosureSeverity,
} from "@/src/services";
import { hashObject } from "@/src/services/hash";

let handle: DbHandle;
let db: Db;

function deliverableWithClaim(): { deliverableId: string; claimId: string } {
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
    type: "TikTok",
    claimedStatus: "delivered",
  });
  const claim = createClaim(db, deliverable.id);
  return { deliverableId: deliverable.id, claimId: claim.id };
}

/** Attach a disclosure requirement and return its id. */
function attachDisclosure(deliverableId: string): string {
  const res = addDisclosureRequirement(db, deliverableId, "collaboration-commerciale");
  if (!res.ok) throw new Error("attach failed");
  const row = res.view.requirements.find((r) => r.isDisclosure);
  if (!row) throw new Error("disclosure row missing");
  return row.id;
}

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
});

describe("attach a France/EU disclosure requirement (AC1)", () => {
  test("adds a critical disclosure-visible requirement with the canonical label", () => {
    const { deliverableId } = deliverableWithClaim();
    const res = addDisclosureRequirement(db, deliverableId, "collaboration-commerciale");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = res.view.requirements.find((r) => r.isDisclosure);
    expect(row).toBeDefined();
    expect(row?.kind).toBe("disclosure-visible");
    expect(row?.criticality).toBe("critical");
    expect(row?.label).toBe("collaboration commerciale");
    expect(row?.satisfactionType).toBe("disclosure");
    // The STABLE identity is the key (localization + dedup both use it).
    expect(row?.disclosureKey).toBe("collaboration-commerciale");
    // Starts unassessed (null tier) → derived cap "unassessed".
    expect(row?.disclosureState).toBeNull();
    expect(row?.disclosureCap).toBe("unassessed");
  });

  test("unknown deliverable → deliverable-not-found", () => {
    const res = addDisclosureRequirement(db, "nope", "images-virtuelles");
    expect(res).toEqual({ ok: false, reason: "deliverable-not-found" });
  });

  test("attaching the SAME checklist item twice is rejected (no duplicate row)", () => {
    const { deliverableId } = deliverableWithClaim();
    const first = addDisclosureRequirement(db, deliverableId, "collaboration-commerciale");
    expect(first.ok).toBe(true);
    const second = addDisclosureRequirement(db, deliverableId, "collaboration-commerciale");
    expect(second).toEqual({ ok: false, reason: "disclosure-already-attached" });
    if (!first.ok) return;
    // Exactly one collaboration-commerciale row exists — no silent duplicate.
    const matches = first.view.requirements.filter(
      (r) => r.disclosureKey === "collaboration-commerciale",
    );
    expect(matches).toHaveLength(1);
  });

  test("dedup keys off the STABLE key, so a label edit can't sneak a duplicate in", () => {
    const { deliverableId } = deliverableWithClaim();
    const first = addDisclosureRequirement(db, deliverableId, "collaboration-commerciale");
    if (!first.ok) throw new Error("setup failed");
    const reqId = first.view.requirements.find(
      (r) => r.disclosureKey === "collaboration-commerciale",
    )?.id;
    if (!reqId) throw new Error("no disclosure row");
    // Operator renames the display label…
    editRequirement(db, deliverableId, reqId, { label: "totally different wording" });
    // …the same checklist item is still refused (identity is the key, not label).
    const again = addDisclosureRequirement(db, deliverableId, "collaboration-commerciale");
    expect(again).toEqual({ ok: false, reason: "disclosure-already-attached" });
  });

  test("DIFFERENT checklist items can coexist on one Deliverable", () => {
    const { deliverableId } = deliverableWithClaim();
    expect(addDisclosureRequirement(db, deliverableId, "collaboration-commerciale").ok).toBe(true);
    const other = addDisclosureRequirement(db, deliverableId, "images-virtuelles");
    expect(other.ok).toBe(true);
    if (other.ok) {
      expect(other.view.requirements.filter((r) => r.isDisclosure)).toHaveLength(2);
    }
  });

  test("a template's France/EU disclosure is KEYED, so a checklist add doesn't duplicate it", () => {
    const { deliverableId } = deliverableWithClaim();
    const applied = applyTemplate(db, deliverableId, "tiktok");
    if (!applied.ok) throw new Error("template failed");
    // The template's single disclosure row carries the collaboration-commerciale key.
    const disclosures = applied.view.requirements.filter((r) => r.isDisclosure);
    expect(disclosures).toHaveLength(1);
    expect(disclosures[0].disclosureKey).toBe("collaboration-commerciale");
    // Adding collaboration-commerciale again is refused — no duplicate critical
    // disclosure, so assessing the one disclosure is enough (no orphaned second).
    const dup = addDisclosureRequirement(db, deliverableId, "collaboration-commerciale");
    expect(dup).toEqual({ ok: false, reason: "disclosure-already-attached" });
    if (!dup.ok) {
      // Still exactly one disclosure on the Deliverable.
      const after = addDisclosureRequirement(db, deliverableId, "images-virtuelles");
      if (after.ok) {
        expect(after.view.requirements.filter((r) => r.isDisclosure)).toHaveLength(2);
        expect(
          after.view.requirements.filter((r) => r.disclosureKey === "collaboration-commerciale"),
        ).toHaveLength(1);
      }
    }
  });
});

describe("three-tier severity drives the verdict (AC2)", () => {
  // proof-of-posting is left unmet here on purpose; we vary ONLY the disclosure
  // tier and read its cap through the derived display + the audit verdict.
  test.each([
    ["evidenced", "green-eligible"],
    ["ambiguous", "caps-yellow"],
    ["partial", "caps-yellow"],
    ["missing", "caps-red"],
  ] as const)("tier %s → derived cap %s", (tier, cap) => {
    const { deliverableId } = deliverableWithClaim();
    const reqId = attachDisclosure(deliverableId);
    const res = setDisclosureSeverity(db, deliverableId, reqId, tier);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = res.view.requirements.find((r) => r.id === reqId);
    expect(row?.disclosureState).toBe(tier);
    expect(row?.disclosureCap).toBe(cap);
  });

  test("a SUPPORTING missing disclosure shows caps-yellow (display mirrors the core)", () => {
    const { deliverableId } = deliverableWithClaim();
    const reqId = attachDisclosure(deliverableId);
    // Reclassify to supporting, then mark missing.
    editRequirement(db, deliverableId, reqId, { criticality: "supporting" });
    const res = setDisclosureSeverity(db, deliverableId, reqId, "missing");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = res.view.requirements.find((r) => r.id === reqId);
    // A missing SUPPORTING disclosure caps at Yellow, never a false Can't-claim.
    expect(row?.disclosureCap).toBe("caps-yellow");
  });

  test("a lone evidenced critical disclosure audits Green; missing audits Red", () => {
    const { deliverableId, claimId } = deliverableWithClaim();
    const reqId = attachDisclosure(deliverableId);

    setDisclosureSeverity(db, deliverableId, reqId, "evidenced");
    expect(resolveEffectiveStatus(db, claimId, "2026-07-11T00:00:00.000Z").machineVerdict).toBe(
      "green",
    );

    setDisclosureSeverity(db, deliverableId, reqId, "missing");
    expect(resolveEffectiveStatus(db, claimId, "2026-07-11T00:00:00.000Z").machineVerdict).toBe(
      "red",
    );

    setDisclosureSeverity(db, deliverableId, reqId, "ambiguous");
    expect(resolveEffectiveStatus(db, claimId, "2026-07-11T00:00:00.000Z").machineVerdict).toBe(
      "yellow",
    );
  });
});

describe("the tier flows into the snapshot + invalidates the cache (AD-4)", () => {
  test("setting a tier changes the Claim's evidence_snapshot_hash", () => {
    const { deliverableId, claimId } = deliverableWithClaim();
    const reqId = attachDisclosure(deliverableId);

    const before = hashObject(assembleSnapshot(db, claimId, "2026-07-11T00:00:00.000Z").claim);
    setDisclosureSeverity(db, deliverableId, reqId, "ambiguous");
    const after = hashObject(assembleSnapshot(db, claimId, "2026-07-11T00:00:00.000Z").claim);
    expect(after).not.toBe(before);
  });

  test("the assembler surfaces the tier only on disclosure rows", () => {
    const { deliverableId, claimId } = deliverableWithClaim();
    const reqId = attachDisclosure(deliverableId);
    setDisclosureSeverity(db, deliverableId, reqId, "partial");

    const snapshot = assembleSnapshot(db, claimId, "2026-07-11T00:00:00.000Z");
    const row = snapshot.claim.requirements.find((r) => r.proofRequirementId === reqId);
    expect(row?.disclosureState).toBe("partial");
  });
});

describe("scoping + kind guards", () => {
  test("setting a tier on a non-disclosure requirement is refused", () => {
    const { deliverableId } = deliverableWithClaim();
    const added = addRequirement(db, deliverableId, {
      kind: "reach-screenshot",
      criticality: "supporting",
      label: "Reach",
    });
    if (!added.ok) throw new Error("setup failed");
    const res = setDisclosureSeverity(
      db,
      deliverableId,
      added.view.requirements[0].id,
      "evidenced",
    );
    expect(res).toEqual({ ok: false, reason: "not-disclosure" });
  });

  test("a requirement id from another Deliverable is not-found (no cross-mutation)", () => {
    const a = deliverableWithClaim();
    const b = deliverableWithClaim();
    const reqId = attachDisclosure(a.deliverableId);
    const res = setDisclosureSeverity(db, b.deliverableId, reqId, "evidenced");
    expect(res).toEqual({ ok: false, reason: "requirement-not-found" });
  });
});

describe("a disclosure-driven verdict is human-overridable like any other (AC3, FR-10)", () => {
  test("an override lifts a disclosure-missing Red to the operator's chosen status", () => {
    const { deliverableId, claimId } = deliverableWithClaim();
    const reqId = attachDisclosure(deliverableId);
    setDisclosureSeverity(db, deliverableId, reqId, "missing");
    // Machine verdict is Red…
    expect(resolveEffectiveStatus(db, claimId, "2026-07-11T00:00:00.000Z").machineVerdict).toBe(
      "red",
    );
    // …the operator overrides to yellow with recorded responsibility.
    createHumanOverride(db, {
      claimId,
      finalStatus: "yellow",
      authoredBy: "operator@example",
    });
    const status = resolveEffectiveStatus(db, claimId, "2026-07-11T00:00:00.000Z");
    expect(status.effectiveStatus).toBe("yellow");
    // The machine verdict stays pinned (never rewritten) beneath the override.
    expect(status.machineVerdict).toBe("red");
  });
});
