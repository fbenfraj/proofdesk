// Disclosure honesty regression (Story 3.3, FR-4, AD-3, AD-22) — mandatory,
// never skipped. Two structural guarantees the three-tier disclosure severity
// must keep no matter how the tiers are wired:
//
//   1. A disclosure sub-fact is ALWAYS a Human assertion (there is no CV/OCR —
//      capability honesty, AD-3). No tier may emit a `machine` trace entry.
//   2. A disclosure verdict describes EVIDENCE ON FILE, never a compliance/legal
//      determination (liability honesty, AD-22). No trace reason may use a
//      compliance/legal word — the honest framing is enforced structurally.

import { describe, expect, test } from "vitest";
import { audit } from "@/src/core";
import {
  type AuditSnapshot,
  type DisclosureState,
  SNAPSHOT_VERSION,
  type SnapshotProofRequirement,
} from "@/src/schema";

function disclosureReq(disclosureState: DisclosureState | null): SnapshotProofRequirement {
  return {
    proofRequirementId: "disclosure",
    kind: "disclosure-visible",
    criticality: "critical",
    disclosureState,
    // A confirmed screenshot so the null-fallback path also resolves to evidenced.
    operatorEvidence: [
      {
        livenessLabel: null,
        humanConfirmations: [
          {
            proofRequirementId: "disclosure",
            confirmedBy: "operator@example",
            confirmedAt: "2026-05-12T20:12:00.000Z",
            machineOrHuman: "human",
          },
        ],
      },
    ],
  };
}

function snap(req: SnapshotProofRequirement): AuditSnapshot {
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    now: "2026-07-09T00:00:00.000Z",
    claim: { claimId: "claim-under-test", requirements: [req] },
  };
}

const TIERS: (DisclosureState | null)[] = ["evidenced", "ambiguous", "partial", "missing", null];

// Words that would imply a compliance/legal determination ProofDesk never makes.
const BANNED = /\b(complian\w*|legal\w*|lawful|unlawful|illegal|conformity|conform\w*)\b/i;

describe("disclosure honesty (AD-3 / AD-22)", () => {
  test.each(TIERS)("tier=%s: every disclosure trace entry is Human, never machine", (tier) => {
    const { trace } = audit(snap(disclosureReq(tier)));
    const disclosureEntries = trace.filter((e) => e.requirementId === "disclosure");
    expect(disclosureEntries.length).toBeGreaterThan(0);
    for (const entry of disclosureEntries) {
      expect(entry.machineOrHuman).toBe("human");
    }
  });

  test.each(TIERS)("tier=%s: no disclosure reason asserts compliance/legality", (tier) => {
    const { trace } = audit(snap(disclosureReq(tier)));
    for (const entry of trace.filter((e) => e.requirementId === "disclosure")) {
      expect(
        entry.reason,
        `reason must speak to evidence, not compliance: "${entry.reason}"`,
      ).not.toMatch(BANNED);
    }
  });
});
