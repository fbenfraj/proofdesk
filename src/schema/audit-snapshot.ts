// The frozen, versioned core/shell contract (AD-16). Story 1.3 defines the
// TYPE only; the snapshot assembler (sole producer) and `audit()` (sole
// consumer) land in Story 1.5.
//
// This file imports ONLY enum TYPES — no effectful modules — so the pure core
// may import it without breaking AD-1 (TS types are erased at runtime).
//
// Shape: per-Claim → per-ProofRequirement rows. `audit(snapshot)` returns one
// verdict, so a snapshot describes exactly one Claim. Every value is
// PRE-RESOLVED by the shell; the core never re-derives liveness / satisfaction
// / confirmation (AD-1, AD-16). There is deliberately NO field for a
// MatchSuggestion or a `suggested`-source link — the core never sees suggestions
// (AD-17).

import type { Criticality, LivenessLabel, MachineOrHuman } from "./enums";

/** Bump when the snapshot SHAPE changes; persisted on AuditResult (AD-4). */
export const SNAPSHOT_VERSION = 1 as const;

/** Disclosure tiers are firmed in Epic 3 (AD-13); nullable placeholder now. */
export type DisclosureState = string | null;

/** An append-only confirmation the page shows the Deliverable (AD-18). */
export interface SnapshotHumanConfirmation {
  proofRequirementId: string;
  confirmedBy: string;
  /** UTC ISO-8601. */
  confirmedAt: string;
  /** Always `human` — never machine (AD-18). */
  machineOrHuman: "human";
}

export interface SnapshotProofRequirement {
  proofRequirementId: string;
  criticality: Criticality;
  /** Pre-resolved by the shell (AD-7); null when no operator-affirmed link. */
  livenessLabel: LivenessLabel | null;
  /** Keyed to this ProofRequirement (AD-18). Only operator links contribute. */
  humanConfirmations: SnapshotHumanConfirmation[];
  disclosureState: DisclosureState;
}

export interface SnapshotClaim {
  claimId: string;
  requirements: SnapshotProofRequirement[];
}

/** The frozen contract handed to the pure core. */
export interface AuditSnapshot {
  snapshotVersion: typeof SNAPSHOT_VERSION;
  /** Server-UTC ISO-8601 (AD-11) — the ONLY time source the core sees (AD-1). */
  now: string;
  claim: SnapshotClaim;
}

/** One decomposed sub-fact of a verdict. `machineOrHuman` is first-class (AD-3);
 *  the array is stored verbatim on AuditResult.trace (AD-4). Story 1.5 fills the
 *  Specification predicates that emit these. */
export interface TraceEntry {
  requirementId: string;
  satisfied: boolean;
  reason: string;
  machineOrHuman: MachineOrHuman;
}
