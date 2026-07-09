// src/services/claim-card — the Claim Card drawer view model (Story 1.8). A
// STRICTLY READ-ONLY projection: it reads a Claim's requirements, its
// operator-affirmed evidence (AD-17), its confirmations (AD-18), and the
// PERSISTED effective status + trace through `readEffectiveStatus` — which never
// recomputes or writes. Opening a Claim Card therefore never runs the audit
// (the 1.6 board discipline; only "Run Proof Audit" writes, AD-6).
//
// The component is purely presentational: every honesty-bearing value here —
// provenance (`machineOrHuman`), per-requirement satisfaction, the trace — is
// read from persisted data, never derived at render time (AD-3).

import {
  type Db,
  getClaimHeader,
  listCaveatsForClaim,
  listClaimEvidenceDetail,
  listHumanConfirmationsForClaim,
  listProofRequirementsForClaim,
} from "@/src/repositories";
import { type SatisfactionType, satisfactionTypeOf } from "@/src/ruleset";
import type {
  Criticality,
  LivenessLabel,
  MachineOrHuman,
  ProofStatus,
  TraceEntry,
} from "@/src/schema";
import { readEffectiveStatus } from "./audit";

/** Requirement-level state for the ✓/○ display (UX-DR14). `pending` = no audit
 *  has run yet (no persisted verdict) — distinct from a resolved `unsatisfied`. */
export type RequirementSatisfaction = "satisfied" | "unsatisfied" | "pending";

/** One operator-authored Caveat shown in the Caveat well (Story 1.9, UX-DR16).
 *  Operator narrative only — machine reasons live in the trace, never here
 *  (AD-6). `authoredBy` is persisted (who set it), never inferred (AD-3). */
export interface ClaimCardCaveat {
  caveatId: string;
  text: string;
  authoredBy: string;
}

/** One operator-affirmed EvidenceLink shown in the Evidence trail, with its
 *  EvidenceItem's first-class provenance (AD-3) and any confirmations on it. */
export interface ClaimCardEvidence {
  evidenceLinkId: string;
  evidenceItemId: string;
  evidenceType: string;
  /** Persisted provenance — never inferred from `evidenceType` (AD-3, AD-19). */
  machineOrHuman: MachineOrHuman;
  uploadedAt: string;
  livenessLabel: LivenessLabel | null;
  confirmations: { confirmedBy: string; confirmedAt: string }[];
}

export interface ClaimCardRequirement {
  proofRequirementId: string;
  kind: string;
  criticality: Criticality;
  satisfactionType: SatisfactionType;
  satisfaction: RequirementSatisfaction;
  /** The operator evidence grouped under this requirement — "which Evidence item
   *  satisfies it" (UX-DR14) is read off this list. */
  evidence: ClaimCardEvidence[];
  /** The persisted trace sub-facts for THIS requirement (verbatim). */
  traceEntries: TraceEntry[];
}

export interface ClaimCardView {
  claimId: string;
  creatorName: string;
  deliverableType: string;
  /** `override.final_status ?? machine_verdict`, or null pre-audit (AD-6). */
  effectiveStatus: ProofStatus | null;
  /** The machine verdict, pinned even under an override (AD-6); null pre-audit. */
  machineVerdict: ProofStatus | null;
  /** The operator override's final status, or null when none is set. */
  overrideStatus: ProofStatus | null;
  /** Who authored the override (persisted), or null when none is set — the
   *  "[operator]" the attribution line stamps (FR-10, AD-3). */
  overrideAuthoredBy: string | null;
  requirements: ClaimCardRequirement[];
  /** The whole verbatim trace (also split per requirement above). */
  trace: TraceEntry[];
  /** Operator-authored caveats on this Claim (append-only, 1..*, AD-18). */
  caveats: ClaimCardCaveat[];
  /** An effective-Yellow (machine OR override) with no caveat yet: it needs at
   *  least one operator-authored Caveat before it is report-includable (AD-6,
   *  AD-20/21). The gate is enforced in the export layer (Epic 4); the card
   *  surfaces it so the operator knows to write one. Source-independent: it keys
   *  off the effective status, not whether the Yellow came from the machine or an
   *  override. */
  requiresCaveat: boolean;
}

/**
 * Assemble the read-only Claim Card view for one Claim. Returns `null` ONLY when
 * the Claim itself does not exist — a Claim with no audit yet is a valid card
 * whose requirements read `pending`. Never writes, never recomputes, never calls
 * `audit()` / `resolveEffectiveStatus`.
 */
export function getClaimCard(db: Db, claimId: string): ClaimCardView | null {
  const header = getClaimHeader(db, claimId);
  if (!header) return null;

  const requirements = listProofRequirementsForClaim(db, claimId);
  const evidenceRows = listClaimEvidenceDetail(db, claimId);
  const confirmations = listHumanConfirmationsForClaim(db, claimId);
  const caveatRows = listCaveatsForClaim(db, claimId);

  // Read-only: null pre-audit (no persisted AuditResult). NEVER the write path.
  const effective = readEffectiveStatus(db, claimId);
  const audited = effective !== null;
  const trace = effective?.trace ?? [];

  const reqs: ClaimCardRequirement[] = requirements.map((req) => {
    const satisfactionType = satisfactionTypeOf(req.kind);
    const traceEntries = trace.filter((t) => t.requirementId === req.id);
    const evidence: ClaimCardEvidence[] = evidenceRows
      .filter((e) => e.proofRequirementId === req.id)
      .map((e) => ({
        evidenceLinkId: e.evidenceLinkId,
        evidenceItemId: e.evidenceItemId,
        evidenceType: e.evidenceType,
        machineOrHuman: e.machineOrHuman,
        uploadedAt: e.uploadedAt,
        livenessLabel: e.livenessLabel,
        confirmations: confirmations
          .filter((c) => c.evidenceLinkId === e.evidenceLinkId)
          .map((c) => ({ confirmedBy: c.confirmedBy, confirmedAt: c.confirmedAt })),
      }));
    return {
      proofRequirementId: req.id,
      kind: req.kind,
      criticality: req.criticality,
      satisfactionType,
      satisfaction: deriveSatisfaction(satisfactionType, traceEntries, audited),
      evidence,
      traceEntries,
    };
  });

  const caveats: ClaimCardCaveat[] = caveatRows.map((c) => ({
    caveatId: c.id,
    text: c.text,
    authoredBy: c.authoredBy,
  }));

  const effectiveStatus = effective?.effectiveStatus ?? null;
  // An effective-Yellow with no caveat yet must be flagged — it cannot be
  // report-included until an operator writes one (AD-6). Source-independent: a
  // machine-Yellow and an override-to-Yellow gate identically.
  const requiresCaveat = effectiveStatus === "yellow" && caveats.length === 0;

  return {
    claimId,
    creatorName: header.creatorName,
    deliverableType: header.deliverableType,
    effectiveStatus,
    machineVerdict: effective?.machineVerdict ?? null,
    overrideStatus: effective?.overrideStatus ?? null,
    overrideAuthoredBy: effective?.overrideAuthoredBy ?? null,
    requirements: reqs,
    trace,
    caveats,
    requiresCaveat,
  };
}

/**
 * Requirement-level satisfaction for the ✓/○ display, mirroring the pure core
 * (`src/core/index.ts`) so the drawer and the verdict never diverge.
 *
 * `link-reachability` (proof-of-posting) emits TWO sub-facts — a machine
 * reachability entry and a human confirmation entry — and the requirement is
 * satisfied on the HUMAN confirmation (`evalLinkReachability`'s `satisfied =
 * confirmed`); the `live` machine entry only distinguishes Green-eligible from
 * Yellow-capped and must NOT gate satisfaction. All other types emit one entry
 * whose `satisfied` is authoritative. Pre-audit → `pending` (never guessed).
 */
function deriveSatisfaction(
  type: SatisfactionType,
  traceEntries: TraceEntry[],
  audited: boolean,
): RequirementSatisfaction {
  if (!audited) return "pending";
  if (type === "link-reachability") {
    return traceEntries.some((t) => t.machineOrHuman === "human" && t.satisfied)
      ? "satisfied"
      : "unsatisfied";
  }
  return traceEntries.some((t) => t.satisfied) ? "satisfied" : "unsatisfied";
}
