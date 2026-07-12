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

import type { Criticality, DisclosureState, LivenessLabel, MachineOrHuman } from "./enums";

/** Bump when the snapshot SHAPE changes; persisted on AuditResult (AD-4).
 *  v2 (Story 1.5): each requirement row carries its `kind` (the core resolves the
 *  satisfaction predicate from it via the ruleset taxonomy, AD-19) and one
 *  `operatorEvidence` entry per source=operator EvidenceLink (AD-17). Liveness
 *  and confirmations are kept associated PER LINK so proof-of-posting Green
 *  requires a single link that is BOTH `live` AND confirmed (AD-5) — they can
 *  never be combined across different links. */
export const SNAPSHOT_VERSION = 2 as const;

/** An append-only confirmation the page shows the Deliverable (AD-18). */
export interface SnapshotHumanConfirmation {
  proofRequirementId: string;
  confirmedBy: string;
  /** UTC ISO-8601. */
  confirmedAt: string;
  /** Always `human` — never machine (AD-18). */
  machineOrHuman: "human";
}

/** One `source = operator` EvidenceLink affirming a requirement (AD-17), with
 *  its own pre-resolved liveness and the confirmations recorded against IT.
 *  Keeping liveness and confirmation associated per link is what stops the core
 *  from combining a `live` label on one link with a confirmation on another
 *  (AD-5). Suggestions are never represented here — the core never sees them. */
export interface SnapshotEvidenceLink {
  /** Pre-resolved four-value liveness of this link's EvidenceItem (AD-7); null
   *  when no check has run. Only `live` satisfies the reachability half (AD-5). */
  livenessLabel: LivenessLabel | null;
  /** Confirmations recorded against THIS link (AD-18). */
  humanConfirmations: SnapshotHumanConfirmation[];
}

export interface SnapshotProofRequirement {
  proofRequirementId: string;
  /** The requirement kind (e.g. `proof-of-posting`). The pure core maps it to a
   *  satisfaction predicate via the ruleset taxonomy (AD-19); it is data, not a
   *  classification the core re-derives. */
  kind: string;
  criticality: Criticality;
  /** Three-tier France/EU disclosure severity (FR-4, Story 3.3), pre-resolved by
   *  the shell from the operator's assessment. Meaningful only for `disclosure`
   *  requirements; null everywhere else and until the operator assesses a tier
   *  (the core then uses the operator-confirmed-evidence fallback). */
  disclosureState: DisclosureState | null;
  /** One entry per `source = operator` EvidenceLink affirming this requirement
   *  (AD-17). Empty means no operator-affirmed evidence — the requirement is
   *  unmet by absence, distinct from present-but-unconfirmed. */
  operatorEvidence: SnapshotEvidenceLink[];
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
