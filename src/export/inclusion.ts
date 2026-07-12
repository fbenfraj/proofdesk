// src/export/inclusion — the SINGLE, PURE report-inclusion resolver (AD-21). It
// is the one place `effective_inclusion = inclusion_override ?? default_from_status`
// is defined, so every consumer (builder view, manifests, HTML render) reads the
// same rule. PURE: imports only types + enums, no DB / clock / HTTP (AD-2). The
// derived audience (`client_visible | internal_only`) is computed here, never
// stored — a stored status-derivative is the stale-verdict shape AI-3 forbids.

import type {
  ProofStatus,
  ReportInclusion,
  ReportInclusionOverride,
  ReportItemAudience,
} from "@/src/schema";

/** The default inclusion for a Claim purely from its effective Proof Status
 *  (AD-21): Green → included · Yellow → included-with-caveat · Red →
 *  excluded-from-client. Exhaustive switch (no `default`) so adding a Proof
 *  Status is a compile error, not a silent fall-through. */
export function defaultInclusionFromStatus(status: ProofStatus): ReportInclusion {
  switch (status) {
    case "green":
      return "included";
    case "yellow":
      return "included-with-caveat";
    case "red":
      return "excluded-from-client";
  }
}

/** The two-audience split derived from a resolved inclusion (AD-21): only an
 *  `excluded-from-client` item is `internal_only`; everything the client sees is
 *  `client_visible`. Derived, never persisted. */
export function audienceOf(inclusion: ReportInclusion): ReportItemAudience {
  return inclusion === "excluded-from-client" ? "internal_only" : "client_visible";
}

/**
 * Resolve a ReportItem's effective inclusion + derived audience (AD-21) —
 * `effective_inclusion = inclusion_override ?? default_from_status(status)`:
 *
 *   - no override    → the status default (`defaultInclusionFromStatus`).
 *   - override `excluded` → `excluded-from-client` (operator pulls it from the client view).
 *   - override `included` → `included`, EXCEPT a Yellow is always caveated, so an
 *     included Yellow stays `included-with-caveat` (a Yellow can never be shown to
 *     the client without its caveat — AD-6). Including a Red is gated on a recorded
 *     Caveat + attribution at the write site (the resolver stays pure).
 *
 * Because the default side is recomputed from the LIVE status every read, a later
 * status change can never leave a stale inclusion behind (AC4), and the stored
 * override is never silently overwritten by a re-audit.
 */
export function resolveReportInclusion(
  status: ProofStatus,
  inclusionOverride: ReportInclusionOverride | null,
): { inclusion: ReportInclusion; audience: ReportItemAudience } {
  let inclusion: ReportInclusion;
  if (inclusionOverride === null) {
    inclusion = defaultInclusionFromStatus(status);
  } else if (inclusionOverride === "excluded") {
    inclusion = "excluded-from-client";
  } else {
    // override === "included": a Yellow stays caveated even when force-included.
    inclusion = status === "yellow" ? "included-with-caveat" : "included";
  }
  return { inclusion, audience: audienceOf(inclusion) };
}
