import { describe, expect, test } from "vitest";
import { STATUS_ORDER } from "@/app/_lib/design-tokens";
import { proofStatusToDisplayKey } from "@/app/_lib/proof-status";
import { type AuditSnapshot, PROOF_STATUS, SNAPSHOT_VERSION } from "@/src/schema";

describe("AuditSnapshot contract (AD-16, AD-17)", () => {
  test("snapshot version is frozen", () => {
    expect(SNAPSHOT_VERSION).toBe(2);
  });

  test("a snapshot requirement row carries only pre-resolved values, never suggestions (AD-17)", () => {
    const snapshot: AuditSnapshot = {
      snapshotVersion: SNAPSHOT_VERSION,
      now: "2026-07-09T00:00:00.000Z",
      claim: {
        claimId: "claim-1",
        requirements: [
          {
            proofRequirementId: "req-1",
            kind: "proof-of-posting",
            criticality: "critical",
            disclosureState: null,
            operatorEvidence: [{ livenessLabel: "live", humanConfirmations: [] }],
          },
        ],
      },
    };
    const keys = Object.keys(snapshot.claim.requirements[0]);
    expect(keys).not.toContain("matchSuggestion");
    expect(keys).not.toContain("matchSuggestions");
    expect(keys).not.toContain("suggestions");
    // Compile-time proof the type has no place to smuggle a suggestion in (AD-17):
    // @ts-expect-error — a snapshot requirement deliberately has no suggestions field
    void snapshot.claim.requirements[0].suggestions;
  });
});

describe("domain ProofStatus → UI display key mapping (drift guard)", () => {
  test("every domain Proof Status maps 1:1 to a valid UI display key", () => {
    for (const status of PROOF_STATUS) {
      expect(STATUS_ORDER).toContain(proofStatusToDisplayKey(status));
    }
    const mapped = new Set(PROOF_STATUS.map(proofStatusToDisplayKey));
    expect(mapped.size).toBe(PROOF_STATUS.length);
  });
});
