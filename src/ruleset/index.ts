// src/ruleset — versioned criticality + satisfaction taxonomy + per-campaign
// override seam (AD-13, AD-19). Ships as typed TS constants (NOT config files,
// NOT a DB-driven rules table). This is versioned audit IP the pure core reads;
// it imports nothing effectful, so `src/core` may depend on it (AD-2).
//
// Story 1.5 introduces the MINIMAL slice the magic-moment demo needs: a version
// string for the cache identity tuple (AD-4) and the kind → satisfaction-type
// taxonomy (AD-19). The Epic-3 work (Story 3.1) firms the default
// critical-requirement set per Deliverable type and real per-campaign overrides;
// membership is deliberately Deferred and NOT hardcoded here.

/** Bumped when the ruleset's IP (taxonomy / defaults) changes; recorded in the
 *  AuditResult identity tuple so a ruleset change invalidates caches (AD-4). */
export const RULESET_VERSION = "1" as const;

/** The three-way satisfaction taxonomy (AD-19) plus `disclosure`, which the
 *  R/Y/G contract treats as its own three-tier dimension (AC-2, AD-13). The
 *  taxonomy is what assigns `machine_or_human` in the trace: only
 *  `link-reachability` / `structured-field` carry a machine sub-fact; disclosure
 *  and human-assertion are always Human (AD-19). */
export type SatisfactionType =
  | "link-reachability" // proof-of-posting: `live` link + HumanConfirmation (AD-5)
  | "disclosure" // three-tier disclosureState, else operator-confirmed evidence (AD-13)
  | "human-assertion" // screenshot/metric/viewer figure — present, never machine-verified (AD-19)
  | "structured-field"; // machine-checkable present/absent (AD-19)

/** Kind → satisfaction-type. Seeded demo kinds are covered; unknown kinds fall
 *  back to the most conservative type (see DEFAULT_SATISFACTION_TYPE). */
const SATISFACTION_TYPE_BY_KIND: Readonly<Record<string, SatisfactionType>> = {
  "proof-of-posting": "link-reachability",
  "disclosure-visible": "disclosure",
  "reach-metric": "human-assertion",
  "segment-timestamp": "human-assertion",
};

/** Unknown kinds default to a Human assertion: present-but-never-machine-verified.
 *  This guarantees a new requirement kind can never *accidentally* claim machine
 *  verification we don't perform (the AD-3/AD-19 honesty default). */
export const DEFAULT_SATISFACTION_TYPE: SatisfactionType = "human-assertion";

/** Resolve a ProofRequirement's satisfaction type from its `kind` (AD-19). */
export function satisfactionTypeOf(kind: string): SatisfactionType {
  return SATISFACTION_TYPE_BY_KIND[kind] ?? DEFAULT_SATISFACTION_TYPE;
}

/** Per-campaign ruleset overrides (AD-13) — the `campaignId → partial overrides`
 *  seam. Empty until Epic 3 (Story 3.1); exposed now so the cache identity's
 *  `campaign_override_hash` is stable and forward-compatible. Returns the
 *  (currently empty) override set for a campaign. */
export function resolveCampaignRulesetOverrides(_campaignId: string): Record<string, never> {
  return {};
}
