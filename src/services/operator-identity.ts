// src/services/operator-identity — the server-resolved display identity of the
// single operator (Story 1.9). ProofDesk has ONE shared operator credential and
// no per-user accounts (AD-14); this is NOT auth. It exists solely to stamp
// `authored_by` on a HumanOverride / Caveat and to compose the "by [operator] ·
// [agency]" attribution line (FR-10, UX-DR17).
//
// It is resolved at the shell boundary and passed INTO the write — never taken
// from a request body — so a client cannot forge who made a human decision
// (the same integrity stance as the server-generated clock, AD-11).

export interface OperatorIdentity {
  /** Stamped as `authored_by`; also the "[operator]" in the attribution line. */
  operator: string;
  /** The "[agency]" in the attribution line. */
  agency: string;
}

/** A non-blank env value, or `undefined` — a whitespace-only var must never
 *  become an empty author. */
function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The operator's display identity from env, with safe defaults:
 *   operator = OPERATOR_NAME ?? OPERATOR_USER ?? "operator"
 *   agency   = OPERATOR_AGENCY ?? "ProofDesk"
 *
 * `OPERATOR_USER` is the basic-auth username (proxy.ts, AD-14) — a sensible
 * fallback name when no explicit display name is configured. Defaults keep the
 * attribution line honest (never blank); production auth still fails closed
 * independently of this.
 */
export function resolveOperatorIdentity(): OperatorIdentity {
  const operator =
    nonBlank(process.env.OPERATOR_NAME) ?? nonBlank(process.env.OPERATOR_USER) ?? "operator";
  const agency = nonBlank(process.env.OPERATOR_AGENCY) ?? "ProofDesk";
  return { operator, agency };
}
