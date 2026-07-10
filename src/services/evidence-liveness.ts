// src/services/evidence-liveness — orchestrates one SSRF-hardened liveness check
// for a link-type EvidenceItem (Story 2.4, AD-7/AD-8). Shell discipline (AD-2):
// this service reads the item through the repository seam, runs the verification
// adapter (the ONLY outbound-HTTP seam), and persists the four-value label + its
// audit trail through the liveness writer. It NEVER touches the DB driver, the
// filesystem, or the network directly.
//
// AD-18: persisting a fresh liveness label updates ONLY the EvidenceItem; a
// HumanConfirmation is never touched (guaranteed by `updateEvidenceLiveness`).

import { type Db, getEvidenceItem, updateEvidenceLiveness } from "@/src/repositories";
import type { LivenessLabel } from "@/src/schema";
import {
  checkLiveness,
  type LivenessDeps,
  type OembedExistence,
  oembedExistence,
} from "@/src/verification";

/** The read-only view the liveness endpoint returns. */
export interface LivenessView {
  evidenceItemId: string;
  label: LivenessLabel;
  status: string | null;
  finalUrl: string;
  reason: string;
  checkedAt: string;
  /** Honesty stamp — present on every non-`dead` label (AD-7). */
  tagline: string | null;
  /** Optional keyless YT/TikTok existence signal — never content verification. */
  oembed: OembedExistence | null;
}

/** Run + persist a liveness check for one link-type EvidenceItem.
 *
 *  Returns `null` when the item does not exist or is not a link-type receipt
 *  (`intake_kind = url` with a stored `url`) — the Route Handler maps that to a
 *  clean 404. `deps` is injectable so the unit suite runs fully offline (AD-10);
 *  production passes none, so the real SSRF-hardened checker is used. */
export async function runEvidenceLiveness(
  db: Db,
  evidenceItemId: string,
  deps: Partial<LivenessDeps> = {},
): Promise<LivenessView | null> {
  const item = getEvidenceItem(db, evidenceItemId);
  if (item?.intakeKind !== "url" || !item.url) return null;

  const result = await checkLiveness(item.url, deps);
  updateEvidenceLiveness(db, evidenceItemId, {
    label: result.label,
    status: result.status,
    finalUrl: result.finalUrl,
    reason: result.reason,
    checkedAt: result.checkedAt,
  });

  // Optional, best-effort existence signal (YT/TikTok only); a failure here
  // never fails the check — the four-value label is already persisted.
  const oembed = await oembedExistence(item.url, deps).catch(() => null);

  return {
    evidenceItemId,
    label: result.label,
    status: result.status,
    finalUrl: result.finalUrl,
    reason: result.reason,
    checkedAt: result.checkedAt,
    tagline: result.tagline,
    oembed,
  };
}
