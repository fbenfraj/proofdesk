// The Claim Card drawer view model (Story 1.8, AD-3/AD-6/AD-17/AD-19). Invariants:
//   1. Opening a card is READ-ONLY — it never persists an AuditResult (no eager
//      audit run; mirrors the 1.6 board rule). Pre-audit requirements read
//      `pending`, distinct from a resolved `unsatisfied`.
//   2. Per-requirement satisfaction mirrors the core: proof-of-posting is
//      satisfied on the HUMAN confirmation, not the `live` machine sub-fact.
//   3. Provenance is read from the persisted `machine_or_human` column — a
//      screenshot/metric is ALWAYS `human`, never machine (AD-19).
//   4. Only operator-affirmed evidence surfaces; `suggested` links never do (AD-17).

import { beforeEach, describe, expect, test } from "vitest";
import { type SeedSummary, seedDemoCampaign } from "@/seed/demo-campaign";
import {
  createCaveat,
  createEvidenceItem,
  createEvidenceLink,
  createHumanOverride,
  createTestDb,
  type Db,
  type DbHandle,
  readAuditResult,
} from "@/src/repositories";
import { getClaimCard, resolveEffectiveStatus } from "@/src/services";

const NOW = "2026-07-09T00:00:00.000Z";

let handle: DbHandle;
let db: Db;
let seed: SeedSummary;

/** Pick a seeded Claim by its documented intended verdict (D1 green-link, D4
 *  yellow-attestation, D8 red-absent). */
function claimByVerdict(verdict: "green" | "yellow" | "red"): string {
  const found = seed.deliverables.find((d) => d.intendedVerdict === verdict);
  if (!found) throw new Error(`no seeded deliverable with intended verdict ${verdict}`);
  return found.claimId;
}

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
  seed = seedDemoCampaign(db);
});

describe("getClaimCard — read-only, never runs the audit (Story 1.8)", () => {
  test("returns null for a Claim that does not exist", () => {
    expect(getClaimCard(db, "no-such-claim")).toBeNull();
  });

  test("pre-audit: requirements read `pending` and NO AuditResult is persisted", () => {
    const claimId = claimByVerdict("green");
    const card = getClaimCard(db, claimId);
    expect(card).not.toBeNull();
    expect(card?.effectiveStatus).toBeNull();
    expect(card?.machineVerdict).toBeNull();
    expect(card?.requirements.length).toBeGreaterThan(0);
    expect(card?.requirements.every((r) => r.satisfaction === "pending")).toBe(true);
    // The read must not have run the audit behind the operator's back.
    expect(readAuditResult(db, claimId)).toBeUndefined();
  });
});

describe("getClaimCard — after the audit resolves (Story 1.8)", () => {
  test("green-link claim: proof-of-posting satisfied with BOTH a machine (live) and a human sub-fact", () => {
    const claimId = claimByVerdict("green");
    resolveEffectiveStatus(db, claimId, NOW);
    const card = getClaimCard(db, claimId);

    expect(card?.effectiveStatus).toBe("green");
    const posting = card?.requirements.find((r) => r.kind === "proof-of-posting");
    expect(posting?.satisfaction).toBe("satisfied");
    // Two decomposed sub-facts: a satisfied machine reachability + a satisfied
    // human confirmation.
    const machine = posting?.traceEntries.find((t) => t.machineOrHuman === "machine");
    const human = posting?.traceEntries.find((t) => t.machineOrHuman === "human");
    expect(machine?.satisfied).toBe(true);
    expect(human?.satisfied).toBe(true);
    // The link evidence carries the `live` liveness + a machine provenance.
    const linkEv = posting?.evidence.find((e) => e.evidenceType === "link");
    expect(linkEv?.livenessLabel).toBe("live");
    expect(linkEv?.machineOrHuman).toBe("machine");
    expect(linkEv?.confirmations.length).toBeGreaterThan(0);
  });

  test("yellow-attestation claim: proof-of-posting satisfied on the human confirmation, machine sub-fact NOT satisfied (no live link)", () => {
    const claimId = claimByVerdict("yellow");
    resolveEffectiveStatus(db, claimId, NOW);
    const card = getClaimCard(db, claimId);

    expect(card?.effectiveStatus).toBe("yellow");
    const posting = card?.requirements.find((r) => r.kind === "proof-of-posting");
    // Satisfied because confirmed — even though the machine reachability failed.
    expect(posting?.satisfaction).toBe("satisfied");
    const machine = posting?.traceEntries.find((t) => t.machineOrHuman === "machine");
    expect(machine?.satisfied).toBe(false);
    // The attestation evidence is a Human assertion, never machine-verified.
    const attestation = posting?.evidence.find((e) => e.evidenceType === "creator-attestation");
    expect(attestation?.machineOrHuman).toBe("human");
    expect(attestation?.livenessLabel).toBeNull();
  });

  test("red-absent claim: critical proof-of-posting is unsatisfied by absence", () => {
    const claimId = claimByVerdict("red");
    resolveEffectiveStatus(db, claimId, NOW);
    const card = getClaimCard(db, claimId);

    expect(card?.effectiveStatus).toBe("red");
    const posting = card?.requirements.find((r) => r.kind === "proof-of-posting");
    expect(posting?.criticality).toBe("critical");
    expect(posting?.satisfaction).toBe("unsatisfied");
    expect(posting?.evidence).toHaveLength(0);
  });

  test("supporting metric evidence is ALWAYS a Human assertion (AD-19)", () => {
    const claimId = claimByVerdict("green");
    resolveEffectiveStatus(db, claimId, NOW);
    const card = getClaimCard(db, claimId);
    const allEvidence = card?.requirements.flatMap((r) => r.evidence) ?? [];
    const metric = allEvidence.find((e) => e.evidenceType === "metric-screenshot");
    expect(metric).toBeDefined();
    expect(metric?.machineOrHuman).toBe("human");
    // No screenshot/metric evidence may ever be machine-labelled.
    for (const e of allEvidence) {
      if (e.evidenceType.endsWith("screenshot")) expect(e.machineOrHuman).toBe("human");
    }
  });
});

describe("getClaimCard — caveats + requiresCaveat gate (Story 1.9, AD-6)", () => {
  test("pre-audit: no caveats and requiresCaveat is false (no verdict to gate)", () => {
    const claimId = claimByVerdict("yellow");
    const card = getClaimCard(db, claimId);
    expect(card?.caveats).toEqual([]);
    expect(card?.requiresCaveat).toBe(false);
  });

  test("effective-Yellow with zero caveats → requiresCaveat is true", () => {
    const claimId = claimByVerdict("yellow");
    resolveEffectiveStatus(db, claimId, NOW);
    const card = getClaimCard(db, claimId);
    expect(card?.effectiveStatus).toBe("yellow");
    expect(card?.caveats).toEqual([]);
    expect(card?.requiresCaveat).toBe(true);
  });

  test("effective-Yellow with a caveat → requiresCaveat clears; the caveat surfaces with its author", () => {
    const claimId = claimByVerdict("yellow");
    resolveEffectiveStatus(db, claimId, NOW);
    createCaveat(db, { claimId, text: "Rests on the creator's word.", authoredBy: "Farouk" });
    const card = getClaimCard(db, claimId);
    expect(card?.requiresCaveat).toBe(false);
    expect(card?.caveats).toHaveLength(1);
    expect(card?.caveats[0]).toMatchObject({
      text: "Rests on the creator's word.",
      authoredBy: "Farouk",
    });
  });

  test("an override TO yellow (over a green machine verdict) also triggers the gate (source-independent)", () => {
    const claimId = claimByVerdict("green");
    resolveEffectiveStatus(db, claimId, NOW);
    createHumanOverride(db, { claimId, finalStatus: "yellow", authoredBy: "Farouk" });
    const card = getClaimCard(db, claimId);
    expect(card?.machineVerdict).toBe("green"); // machine verdict stays pinned
    expect(card?.effectiveStatus).toBe("yellow"); // override is the effective status
    expect(card?.overrideStatus).toBe("yellow");
    expect(card?.requiresCaveat).toBe(true);
  });

  test("effective-Green (or Red) never requires a caveat", () => {
    const claimId = claimByVerdict("green");
    resolveEffectiveStatus(db, claimId, NOW);
    const card = getClaimCard(db, claimId);
    expect(card?.effectiveStatus).toBe("green");
    expect(card?.requiresCaveat).toBe(false);
  });
});

describe("getClaimCard — honesty: suggestions never surface (AD-17)", () => {
  test("a `suggested`-source EvidenceLink never appears in the card's evidence", () => {
    const claimId = claimByVerdict("green");
    // Attach a suggested link to the claim's proof-of-posting requirement.
    const green = seed.deliverables.find((d) => d.claimId === claimId);
    const postingReqId = green?.requirements.find(
      (r) => r.kind === "proof-of-posting",
    )?.proofRequirementId;
    expect(postingReqId).toBeDefined();
    const suggestedItem = createEvidenceItem(db, {
      campaignId: seed.campaignId,
      type: "link",
      machineOrHuman: "machine",
      uploadedAt: NOW,
      livenessLabel: "live",
    });
    createEvidenceLink(db, {
      evidenceItemId: suggestedItem.id,
      proofRequirementId: postingReqId as string,
      source: "suggested",
    });

    resolveEffectiveStatus(db, claimId, NOW);
    const card = getClaimCard(db, claimId);
    const allEvidence = card?.requirements.flatMap((r) => r.evidence) ?? [];
    expect(allEvidence.some((e) => e.evidenceItemId === suggestedItem.id)).toBe(false);
  });
});
