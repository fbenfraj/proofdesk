// Pure audit core — dense table-driven coverage (AD-1, BUILD-HANDOFF §5). The
// core is pure, so every rule is exercised with plain `AuditSnapshot` fixtures
// and no mocks. Covers the R/Y/G contract (AC-2), the AD-5 reachability gate
// (incl. that liveness + confirmation are never combined across links),
// disclosure tiers, critical-vs-supporting thresholds, determinism/idempotency,
// and the honesty invariant that a Human-assertion sub-fact is never labelled
// `machine` (AD-19).

import { describe, expect, test } from "vitest";
import { audit } from "@/src/core";
import {
  type AuditSnapshot,
  type Criticality,
  type LivenessLabel,
  SNAPSHOT_VERSION,
  type SnapshotEvidenceLink,
  type SnapshotHumanConfirmation,
  type SnapshotProofRequirement,
} from "@/src/schema";

// --- fixture helpers -------------------------------------------------------

let seq = 0;
function req(
  over: Partial<SnapshotProofRequirement> & {
    kind: string;
    criticality: Criticality;
  },
): SnapshotProofRequirement {
  seq += 1;
  return {
    proofRequirementId: over.proofRequirementId ?? `req-${seq}`,
    kind: over.kind,
    criticality: over.criticality,
    disclosureState: over.disclosureState ?? null,
    operatorEvidence: over.operatorEvidence ?? [],
  };
}

function conf(proofRequirementId: string): SnapshotHumanConfirmation {
  return {
    proofRequirementId,
    confirmedBy: "operator@example",
    confirmedAt: "2026-05-12T20:12:00.000Z",
    machineOrHuman: "human",
  };
}

/** One operator EvidenceLink with its own liveness + confirmations. */
function link(
  livenessLabel: LivenessLabel | null,
  humanConfirmations: SnapshotHumanConfirmation[] = [],
): SnapshotEvidenceLink {
  return { livenessLabel, humanConfirmations };
}

function snap(requirements: SnapshotProofRequirement[]): AuditSnapshot {
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    now: "2026-07-09T00:00:00.000Z",
    claim: { claimId: "claim-under-test", requirements },
  };
}

/** A fully machine-satisfied critical proof-of-posting: one live+confirmed link. */
function greenPosting(id = "posting"): SnapshotProofRequirement {
  return req({
    proofRequirementId: id,
    kind: "proof-of-posting",
    criticality: "critical",
    operatorEvidence: [link("live", [conf(id)])],
  });
}

/** A critical disclosure evidenced by an operator-confirmed screenshot. */
function greenDisclosure(id = "disclosure"): SnapshotProofRequirement {
  return req({
    proofRequirementId: id,
    kind: "disclosure-visible",
    criticality: "critical",
    operatorEvidence: [link(null, [conf(id)])],
  });
}

// --- R/Y/G decision table --------------------------------------------------

describe("audit() R/Y/G contract (AC-2)", () => {
  const cases: [string, AuditSnapshot, "green" | "yellow" | "red"][] = [
    [
      "green: live+confirmed posting + evidenced disclosure",
      snap([greenPosting(), greenDisclosure()]),
      "green",
    ],
    [
      "green: + present supporting metric",
      snap([
        greenPosting(),
        greenDisclosure(),
        req({ kind: "reach-metric", criticality: "supporting", operatorEvidence: [link(null)] }),
      ]),
      "green",
    ],
    [
      "yellow: critical posting rests on a human attestation (confirmed, not live)",
      snap([
        req({
          proofRequirementId: "posting",
          kind: "proof-of-posting",
          criticality: "critical",
          operatorEvidence: [link(null, [conf("posting")])],
        }),
        greenDisclosure(),
      ]),
      "yellow",
    ],
    [
      "yellow: liveness and confirmation on DIFFERENT links never combine to Green (AD-5)",
      snap([
        req({
          proofRequirementId: "posting",
          kind: "proof-of-posting",
          criticality: "critical",
          // link A is live but unconfirmed; link B is confirmed but not live.
          operatorEvidence: [link("live"), link(null, [conf("posting")])],
        }),
        greenDisclosure(),
      ]),
      "yellow",
    ],
    [
      "yellow: supporting requirement missing",
      snap([
        greenPosting(),
        greenDisclosure(),
        req({ kind: "reach-metric", criticality: "supporting", operatorEvidence: [] }),
      ]),
      "yellow",
    ],
    [
      "green: explicit evidenced disclosure tier is Green-eligible",
      snap([
        greenPosting(),
        req({
          proofRequirementId: "disclosure",
          kind: "disclosure-visible",
          criticality: "critical",
          disclosureState: "evidenced",
        }),
      ]),
      "green",
    ],
    [
      "yellow: disclosure ambiguous",
      snap([
        greenPosting(),
        req({
          proofRequirementId: "disclosure",
          kind: "disclosure-visible",
          criticality: "critical",
          disclosureState: "ambiguous",
        }),
      ]),
      "yellow",
    ],
    [
      "yellow: disclosure partial caps at Yellow",
      snap([
        greenPosting(),
        req({
          proofRequirementId: "disclosure",
          kind: "disclosure-visible",
          criticality: "critical",
          disclosureState: "partial",
        }),
      ]),
      "yellow",
    ],
    [
      "red: explicit missing disclosure tier caps at Red",
      snap([
        greenPosting(),
        req({
          proofRequirementId: "disclosure",
          kind: "disclosure-visible",
          criticality: "critical",
          disclosureState: "missing",
        }),
      ]),
      "red",
    ],
    [
      "red: critical posting unmet (no confirmed link)",
      snap([
        req({ kind: "proof-of-posting", criticality: "critical", operatorEvidence: [] }),
        greenDisclosure(),
      ]),
      "red",
    ],
    [
      "red: critical disclosure missing",
      snap([
        greenPosting(),
        req({ kind: "disclosure-visible", criticality: "critical", operatorEvidence: [] }),
      ]),
      "red",
    ],
    [
      "red beats yellow: unmet critical AND missing supporting",
      snap([
        req({ kind: "proof-of-posting", criticality: "critical", operatorEvidence: [] }),
        greenDisclosure(),
        req({ kind: "reach-metric", criticality: "supporting", operatorEvidence: [] }),
      ]),
      "red",
    ],
  ];

  test.each(cases)("%s", (_desc, snapshot, expected) => {
    expect(audit(snapshot).verdict).toBe(expected);
  });

  test("no proof bar (empty requirement set) is Red, never a vacuous Green", () => {
    const result = audit(snap([]));
    expect(result.verdict).toBe("red");
    // The trace carries an explicit reason — the honest history says WHY.
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0].satisfied).toBe(false);
    expect(result.trace[0].reason).toMatch(/no proof requirements/i);
  });
});

// --- supporting disclosure never silently goes Green (Story 3.3) -----------

describe("a SUPPORTING disclosure is consistent with the taxonomy (never a false Green)", () => {
  test("supporting disclosure `missing` caps at Yellow, not Green", () => {
    const snapshot = snap([
      greenPosting(),
      greenDisclosure(), // a satisfied critical disclosure keeps the bar meaningful
      req({
        proofRequirementId: "extra-disclosure",
        kind: "disclosure-visible",
        criticality: "supporting",
        disclosureState: "missing",
      }),
    ]);
    // A missing supporting requirement must cap at Yellow — never be ignored.
    expect(audit(snapshot).verdict).toBe("yellow");
  });

  test("supporting disclosure `evidenced` is Green-eligible", () => {
    const snapshot = snap([
      greenPosting(),
      greenDisclosure(),
      req({
        proofRequirementId: "extra-disclosure",
        kind: "disclosure-visible",
        criticality: "supporting",
        disclosureState: "evidenced",
      }),
    ]);
    expect(audit(snapshot).verdict).toBe("green");
  });

  test("supporting disclosure fallback (no tier, no confirmation) caps at Yellow", () => {
    const snapshot = snap([
      greenPosting(),
      greenDisclosure(),
      req({
        proofRequirementId: "extra-disclosure",
        kind: "disclosure-visible",
        criticality: "supporting",
        operatorEvidence: [],
      }),
    ]);
    expect(audit(snapshot).verdict).toBe("yellow");
  });
});

// --- AD-5 reachability gate: only `live` satisfies -------------------------

describe("AD-5 reachability gate — only `live` satisfies the machine half", () => {
  const nonLive: (LivenessLabel | null)[] = ["blocked", "unresolved", "dead", null];

  test.each(nonLive)("posting confirmed but liveness=%s caps at yellow", (label) => {
    const snapshot = snap([
      req({
        proofRequirementId: "posting",
        kind: "proof-of-posting",
        criticality: "critical",
        operatorEvidence: [link(label, [conf("posting")])],
      }),
      greenDisclosure(),
    ]);
    expect(audit(snapshot).verdict).toBe("yellow");
  });

  test("live link WITHOUT a confirmation is red (needs BOTH halves on one link)", () => {
    const snapshot = snap([
      req({
        proofRequirementId: "posting",
        kind: "proof-of-posting",
        criticality: "critical",
        operatorEvidence: [link("live")],
      }),
      greenDisclosure(),
    ]);
    expect(audit(snapshot).verdict).toBe("red");
  });
});

// --- determinism / idempotency (NFR-D2, AC-4) ------------------------------

describe("determinism & idempotency", () => {
  test("same snapshot yields identical verdict + trace every time", () => {
    const snapshot = snap([greenPosting(), greenDisclosure()]);
    const a = audit(snapshot);
    const b = audit(snapshot);
    expect(a).toEqual(b);
  });
});

// --- honesty regression (AD-19) --------------------------------------------

describe("honesty regression — provenance never lies (AD-19)", () => {
  test("no trace entry labels a human-assertion or disclosure sub-fact as `machine`", () => {
    const snapshot = snap([
      greenPosting(),
      greenDisclosure(),
      req({
        proofRequirementId: "metric",
        kind: "reach-metric",
        criticality: "supporting",
        operatorEvidence: [link(null)],
      }),
    ]);
    const { trace } = audit(snapshot);
    const humanOnly = new Set(["disclosure", "metric"]);
    for (const entry of trace) {
      if (humanOnly.has(entry.requirementId)) {
        expect(entry.machineOrHuman).toBe("human");
      }
    }
    // The proof-of-posting requirement legitimately carries a machine sub-fact
    // (link reachability) AND a human sub-fact (the confirmation).
    const posting = trace.filter((e) => e.requirementId === "posting");
    expect(posting.map((e) => e.machineOrHuman).sort()).toEqual(["human", "machine"]);
  });
});
