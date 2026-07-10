// src/services/human-confirmation — the write orchestration behind the Claim
// Card's "Confirm page shows the Deliverable" control (Story 2.3, FR-7, AD-5,
// AD-18). Thin shell between the Route Handler and the repository (AD-2): it
// appends ONE immutable HumanConfirmation and returns the refreshed READ-ONLY
// Claim Card view in a single round-trip, so the drawer re-renders from one
// response — the same shape as the override/caveat write seams (Story 1.9).
//
// Honesty stance:
//   - Only a `source = operator` link on THIS Claim can be confirmed. A
//     `suggested` link, a foreign-Claim link, or an unknown id is rejected with
//     null (→ 404) BEFORE any write, so a machine suggestion can never be lifted
//     into a human confirmation (AD-17). We validate against the same
//     operator-only list the snapshot reads, so the confirm surface and the audit
//     agree on exactly which links exist.
//   - `machine_or_human = human` is forced by the repository writer + column
//     default and validated there (AD-18); it is never taken from any input.
//   - `confirmedBy` (operator identity) and `confirmedAt` (UTC clock) are resolved
//     by the shell (Route Handler) and passed IN — never from the request body —
//     so who/when a human attested can't be forged (integrity, cf. AD-11/AD-14).
//   - This path NEVER runs the audit (AD-6). Appending a confirmation changes the
//     Claim's snapshot (thus its evidence hash), so the AuditResult cache goes
//     stale and the verdict recomputes on the next explicit "Run Proof Audit"
//     (Story 1.7) — never behind the operator's back here.

import {
  appendHumanConfirmation,
  type Db,
  listOperatorEvidenceForClaim,
  listProofRequirementsForClaim,
} from "@/src/repositories";
import { satisfactionTypeOf } from "@/src/ruleset";
import { type ClaimCardView, getClaimCard } from "./claim-card";

export interface ConfirmDeliverablePageInput {
  claimId: string;
  /** The operator-affirmed EvidenceLink the operator is attesting for. */
  evidenceLinkId: string;
  /** Shell-resolved operator identity (never client-supplied). */
  confirmedBy: string;
  /** Server-resolved UTC ISO-8601 (never client-supplied, AD-11). */
  confirmedAt: string;
}

/**
 * Append the operator's "this page shows the Deliverable" confirmation, then
 * return the refreshed card. Returns null when the Claim does not exist OR the
 * link is not one of the Claim's operator-affirmed links (the route maps null to
 * 404). The ProofRequirement, campaign, and `data_origin` are derived from the
 * link itself by the repository writer (AD-9), so a confirmation can never be
 * filed against a requirement the link does not satisfy.
 */
export function confirmDeliverablePage(
  db: Db,
  input: ConfirmDeliverablePageInput,
): ClaimCardView | null {
  // The link MUST be one of this Claim's `source = operator` links (AD-17). This
  // single guard covers unknown ids, foreign-Claim links, and suggested links,
  // and yields a clean 404 instead of a 500 from the writer throwing.
  const operatorLinks = listOperatorEvidenceForClaim(db, input.claimId);
  const link = operatorLinks.find((l) => l.evidenceLinkId === input.evidenceLinkId);
  if (!link) {
    return null;
  }

  // "This page shows the Deliverable" is meaningful ONLY on a proof-of-posting
  // (link-reachability) requirement (AC1, AD-5): the `live` link resolves the
  // machine half and this confirmation the human half. Screenshots/metrics are
  // Human assertions by nature (AD-19) and disclosure has its own evidence path —
  // none of them take a page confirmation. Enforce it in the service, not only in
  // the drawer, so a DIRECT API call can't forge an attestation the UI never
  // offers (this mirrors the drawer's affordance gate exactly).
  const requirement = listProofRequirementsForClaim(db, input.claimId).find(
    (r) => r.id === link.proofRequirementId,
  );
  if (!requirement || satisfactionTypeOf(requirement.kind) !== "link-reachability") {
    return null;
  }

  appendHumanConfirmation(db, {
    evidenceLinkId: input.evidenceLinkId,
    confirmedBy: input.confirmedBy,
    confirmedAt: input.confirmedAt,
  });

  return getClaimCard(db, input.claimId);
}
