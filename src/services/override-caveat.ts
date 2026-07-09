// src/services/override-caveat — the write orchestration behind the Claim Card's
// Operator-override toggle and Caveat well (Story 1.9, FR-10). Thin shell between
// the Route Handlers and the repository (AD-2): each function persists one human
// decision and returns the refreshed READ-ONLY Claim Card view in a single
// round-trip, so the drawer re-renders from one response.
//
// Honesty stance (AD-6): NONE of these paths run the audit. Override and caveat
// are OVERLAYS on the machine verdict, never a recompute — only "Run Proof Audit"
// (Story 1.7) writes an AuditResult. The effective status the returned view
// carries is read through `readEffectiveStatus` (override.final_status ??
// machine_verdict), the one resolver every consumer shares.
//
// `authoredBy` is resolved by the shell (Route Handler, via resolveOperator
// Identity) and passed IN — never taken from the request body — so who made a
// human decision can't be forged (integrity, cf. the server clock of AD-11).

import {
  createCaveat,
  createHumanOverride,
  type Db,
  deleteHumanOverride,
  getClaimHeader,
} from "@/src/repositories";
import type { ProofStatus } from "@/src/schema";
import { type ClaimCardView, getClaimCard } from "./claim-card";

/** True when the Claim exists — override/caveat writes campaign-resolve through
 *  it, so guard first and let the route return a clean 404 instead of a 500. */
function claimExists(db: Db, claimId: string): boolean {
  return getClaimHeader(db, claimId) !== undefined;
}

export interface SetOverrideInput {
  claimId: string;
  finalStatus: ProofStatus;
  /** Shell-resolved operator identity (never client-supplied). */
  authoredBy: string;
}

/** Set (or change) the operator override for a Claim, then return the refreshed
 *  card. Upserts (0..1 per Claim). The machine verdict is untouched and stays
 *  pinned in the returned view (AD-6). Returns null if the Claim doesn't exist. */
export function setClaimOverride(db: Db, input: SetOverrideInput): ClaimCardView | null {
  if (!claimExists(db, input.claimId)) return null;
  createHumanOverride(db, {
    claimId: input.claimId,
    finalStatus: input.finalStatus,
    authoredBy: input.authoredBy,
  });
  return getClaimCard(db, input.claimId);
}

/** Clear the operator override (the toggle's OFF path) — effective status falls
 *  back to the pure machine verdict. Idempotent. Returns null if no such Claim. */
export function clearClaimOverride(db: Db, claimId: string): ClaimCardView | null {
  if (!claimExists(db, claimId)) return null;
  deleteHumanOverride(db, claimId);
  return getClaimCard(db, claimId);
}

export interface AddCaveatInput {
  claimId: string;
  text: string;
  /** Shell-resolved operator identity (never client-supplied). */
  authoredBy: string;
}

/** Append an operator-authored caveat (append-only, 1..*, AD-18), then return the
 *  refreshed card — on an effective-Yellow this clears `requiresCaveat`. Returns
 *  null if the Claim doesn't exist. */
export function addClaimCaveat(db: Db, input: AddCaveatInput): ClaimCardView | null {
  if (!claimExists(db, input.claimId)) return null;
  createCaveat(db, {
    claimId: input.claimId,
    text: input.text,
    authoredBy: input.authoredBy,
  });
  return getClaimCard(db, input.claimId);
}
