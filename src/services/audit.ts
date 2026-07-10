// src/services/audit — the imperative shell around the pure core (AD-2). Two
// responsibilities:
//
//   1. The SOLE snapshot assembler (AD-16): the ONLY producer of AuditSnapshot.
//      It reads a Claim's requirements/evidence/confirmations through the
//      repository seam, filters to operator-affirmed evidence only (AD-17), maps
//      liveness onto the requirement rows (AD-5/AD-7), and injects server `now`
//      (AD-11) — the only clock the core ever sees.
//
//   2. The single effective-status resolver (AD-4, AD-6): `override.final_status
//      ?? machine_verdict`, where machine_verdict is the persisted AuditResult
//      for the Claim's identity tuple `(ruleset_version, campaign_override_hash,
//      evidence_snapshot_hash)`. If the tuple is stale it recomputes-and-persists
//      FIRST, so cache and recompute are one value by construction. No other code
//      calls `audit()` for status.

import { createHash } from "node:crypto";
import { audit } from "@/src/core";
import {
  campaignIdOfClaim,
  type Db,
  getHumanOverride,
  listHumanConfirmationsForClaim,
  listOperatorEvidenceForClaim,
  listProofRequirementsForClaim,
  readAuditResult,
  upsertAuditResult,
} from "@/src/repositories";
import { RULESET_VERSION, resolveCampaignRulesetOverrides } from "@/src/ruleset";
import {
  type AuditSnapshot,
  type ProofStatus,
  SNAPSHOT_VERSION,
  type SnapshotEvidenceLink,
  type SnapshotProofRequirement,
  type TraceEntry,
} from "@/src/schema";

// --- The snapshot assembler (AD-16) ----------------------------------------

/**
 * Assemble the AuditSnapshot for exactly one Claim. This is the SOLE producer of
 * AuditSnapshot (AD-16). Rows are sorted deterministically so the snapshot — and
 * thus its content hash — is stable across runs.
 *
 * @param now server-UTC ISO-8601 (AD-11); the only time value the core sees.
 */
export function assembleSnapshot(db: Db, claimId: string, now: string): AuditSnapshot {
  const requirements = listProofRequirementsForClaim(db, claimId);
  const evidence = listOperatorEvidenceForClaim(db, claimId);
  const confirmations = listHumanConfirmationsForClaim(db, claimId);

  const rows: SnapshotProofRequirement[] = requirements
    .map((req): SnapshotProofRequirement => {
      // One SnapshotEvidenceLink per operator link, each carrying ITS OWN
      // liveness and the confirmations recorded against IT — never combined
      // across links (AD-5). Sorted by link id for a deterministic snapshot.
      const operatorEvidence: SnapshotEvidenceLink[] = evidence
        .filter((e) => e.proofRequirementId === req.id)
        .slice()
        .sort((a, b) => a.evidenceLinkId.localeCompare(b.evidenceLinkId))
        .map((e) => ({
          livenessLabel: e.livenessLabel,
          humanConfirmations: confirmations
            .filter((c) => c.evidenceLinkId === e.evidenceLinkId)
            .map((c) => ({
              proofRequirementId: c.proofRequirementId,
              confirmedBy: c.confirmedBy,
              confirmedAt: c.confirmedAt,
              // HumanConfirmations are `human` by construction (AD-18); the DB
              // guard enforces it, so the snapshot literal is safe.
              machineOrHuman: "human" as const,
            }))
            .sort(
              (a, b) =>
                a.confirmedAt.localeCompare(b.confirmedAt) ||
                a.confirmedBy.localeCompare(b.confirmedBy),
            ),
        }));
      return {
        proofRequirementId: req.id,
        kind: req.kind,
        criticality: req.criticality,
        // Disclosure tiers are firmed in Epic 3 (AD-13); null for now — the core
        // falls back to operator-confirmed evidence.
        disclosureState: null,
        operatorEvidence,
      };
    })
    .sort((a, b) => a.proofRequirementId.localeCompare(b.proofRequirementId));

  return {
    snapshotVersion: SNAPSHOT_VERSION,
    now,
    claim: { claimId, requirements: rows },
  };
}

// --- The effective-status resolver + AuditResult cache (AD-4, AD-6) ---------

export interface EffectiveStatus {
  claimId: string;
  /** `override.final_status ?? machine_verdict` (AD-6). */
  effectiveStatus: ProofStatus;
  /** The machine verdict, pinned even when an override overlays it (AD-6). */
  machineVerdict: ProofStatus;
  /** The operator override's final status, or null when none is set. */
  overrideStatus: ProofStatus | null;
  /** Who authored the override (persisted `authored_by`), or null when none is
   *  set — the attribution the Claim Card stamps "by [operator]" (FR-10, AD-3). */
  overrideAuthoredBy: string | null;
  /** Verbatim machine trace — the ONLY home of machine reasoning (AD-6). */
  trace: TraceEntry[];
}

/**
 * The single resolver every consumer reads for a Claim's status (AD-6). No
 * consumer calls `audit()` directly. Recomputes-and-persists the machine verdict
 * first if the AuditResult cache is stale, then overlays the human override.
 * This is the WRITE-capable path — only the explicit "Run Proof Audit" action
 * (Story 1.7) should reach it. Read-only consumers use `readEffectiveStatus`.
 */
export function resolveEffectiveStatus(db: Db, claimId: string, now?: string): EffectiveStatus {
  const machine = resolveMachineVerdict(db, claimId, now);
  return overlayOverride(db, claimId, machine.machineVerdict, machine.trace);
}

/**
 * READ-ONLY effective status: overlays the human override on the PERSISTED
 * machine verdict without ever recomputing or writing. Returns null when no
 * AuditResult exists yet (pre-audit). Consumers that must not trigger an audit
 * run — the Campaign Board (Story 1.6) — read through this, so merely loading a
 * surface after evidence/ruleset changes never runs the audit behind the
 * operator's back. A stale cache is refreshed only by the explicit re-run.
 */
export function readEffectiveStatus(db: Db, claimId: string): EffectiveStatus | null {
  const cached = readAuditResult(db, claimId);
  if (!cached) return null;
  return overlayOverride(db, claimId, cached.machineVerdict, cached.trace);
}

/** Overlay the human override on a machine verdict — the ONE definition of
 *  `effective = override.final_status ?? machine_verdict` (AD-6), shared by the
 *  write-capable resolver and the read-only reader so they can never diverge. */
function overlayOverride(
  db: Db,
  claimId: string,
  machineVerdict: ProofStatus,
  trace: TraceEntry[],
): EffectiveStatus {
  const override = getHumanOverride(db, claimId);
  const overrideStatus = override?.finalStatus ?? null;
  return {
    claimId,
    effectiveStatus: overrideStatus ?? machineVerdict,
    machineVerdict,
    overrideStatus,
    overrideAuthoredBy: override?.authoredBy ?? null,
    trace,
  };
}

/** Resolve the machine verdict via the cache: reuse the persisted AuditResult
 *  when its identity tuple matches, else recompute-and-persist before reading
 *  (AD-4). Cache-warm and cache-stale return one value by construction. */
function resolveMachineVerdict(
  db: Db,
  claimId: string,
  now?: string,
): { machineVerdict: ProofStatus; trace: TraceEntry[] } {
  const campaignId = campaignIdOfClaim(db, claimId);
  const snapshot = assembleSnapshot(db, claimId, now ?? new Date().toISOString());
  const identity = {
    snapshotVersion: SNAPSHOT_VERSION,
    rulesetVersion: RULESET_VERSION,
    campaignOverrideHash: hashObject(resolveCampaignRulesetOverrides(campaignId)),
    // Excludes `now` (it changes every run) so the cache is genuinely reusable
    // and a re-run over the same evidence is idempotent (AC-4).
    evidenceSnapshotHash: hashObject(snapshot.claim),
  };

  const cached = readAuditResult(db, claimId);
  if (
    cached &&
    cached.snapshotVersion === identity.snapshotVersion &&
    cached.rulesetVersion === identity.rulesetVersion &&
    cached.campaignOverrideHash === identity.campaignOverrideHash &&
    cached.evidenceSnapshotHash === identity.evidenceSnapshotHash
  ) {
    return { machineVerdict: cached.machineVerdict, trace: cached.trace };
  }

  const { verdict, trace } = audit(snapshot);
  upsertAuditResult(db, {
    claimId,
    machineVerdict: verdict,
    trace,
    snapshotVersion: identity.snapshotVersion,
    rulesetVersion: identity.rulesetVersion,
    campaignOverrideHash: identity.campaignOverrideHash,
    evidenceSnapshotHash: identity.evidenceSnapshotHash,
  });
  return { machineVerdict: verdict, trace };
}

/** Deterministic SHA-256 over a canonical JSON serialization. The assembler
 *  builds objects with stable key order and sorted arrays, so JSON.stringify is
 *  canonical here. */
function hashObject(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
