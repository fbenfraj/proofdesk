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

import type { Criticality } from "@/src/schema/enums";
import type { DefaultProofRequirement } from "./default-requirement-sets";

/** Bumped when the ruleset's IP (taxonomy / defaults) OR the pure core's
 *  verdict-determining decision logic changes; recorded in the AuditResult
 *  identity tuple so a change invalidates caches (AD-4). This IP is applied
 *  INSIDE the core and is NOT part of the evidence-snapshot hash, so this version
 *  is the ONLY cache guard — any change to `SATISFACTION_TYPE_BY_KIND` OR to a
 *  `src/core` decision rule must bump it (AD-13: a verdict's identity is
 *  `(ruleset_version, campaign_override_hash)`).
 *  v2 (Story 3.1): added the default-set kinds, incl. `segment-timestamp-field`
 *  → `structured-field`.
 *  v3 (Story 3.3): `evalDisclosure` now caps a SUPPORTING unmet disclosure at
 *  Yellow instead of silently ignoring it into a Green (consistency with the
 *  other predicates). Existing claims recompute; only a supporting-disclosure-
 *  unmet scenario changes verdict (an incorrect Green → the correct Yellow). The
 *  seed's disclosures are all `critical` → seeded verdicts are unchanged. */
export const RULESET_VERSION = "3" as const;

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

/** Kind → satisfaction-type. Seeded demo kinds + the Story 3.1 default-set kinds
 *  are covered; unknown kinds fall back to the most conservative type (see
 *  DEFAULT_SATISFACTION_TYPE).
 *
 *  Honesty note (AD-19): every metric/figure/capture kind maps to
 *  `human-assertion` — a screenshot, a viewer/CCV/view figure, a reach number and
 *  a durable Story capture are operator-entered evidence, NEVER machine-verified.
 *  Only `proof-of-posting` (a checkable link) is machine, and only for
 *  reachability (AD-5) — never for content. `segment-timestamp` stays
 *  `human-assertion` (the seed's operator-asserted note); the Proof-Brief
 *  *structured* timestamp field is the DISTINCT kind `segment-timestamp-field`
 *  (present/absent is machine-checkable, its value is not). */
const SATISFACTION_TYPE_BY_KIND: Readonly<Record<string, SatisfactionType>> = {
  // Seeded-demo vocabulary (Story 1.4/1.5) — do not change: honesty-anchor +
  // i18n tests pin these, and the magic-moment verdicts depend on them.
  "proof-of-posting": "link-reachability",
  "disclosure-visible": "disclosure",
  "reach-metric": "human-assertion",
  "segment-timestamp": "human-assertion",
  // Story 3.1 default-set vocabulary (additive — not yet wired to any audit).
  "segment-timestamp-field": "structured-field", // present/absent field, per epic AC3
  "durable-capture": "human-assertion", // ephemeral-Story screenshot/clip
  "viewer-figure": "human-assertion", // Twitch viewer/CCV + YouTube view figure
  "channel-match": "human-assertion", // operator affirmation, not machine-checked
  "reach-screenshot": "human-assertion",
  "metric-screenshot": "human-assertion",
};

/** Unknown kinds default to a Human assertion: present-but-never-machine-verified.
 *  This guarantees a new requirement kind can never *accidentally* claim machine
 *  verification we don't perform (the AD-3/AD-19 honesty default). */
export const DEFAULT_SATISFACTION_TYPE: SatisfactionType = "human-assertion";

/** Resolve a ProofRequirement's satisfaction type from its `kind` (AD-19). */
export function satisfactionTypeOf(kind: string): SatisfactionType {
  return SATISFACTION_TYPE_BY_KIND[kind] ?? DEFAULT_SATISFACTION_TYPE;
}

// --- per-campaign override seam (AD-13) -----------------------------------
//
// The `campaignId → partial overrides` seam. A campaign starts from its
// Deliverable-type default set (default-requirement-sets.ts) and layers a
// partial override on top: re-classify a requirement's criticality, remove one,
// or add one. `applyCampaignOverrides` folds the override into an effective set;
// `resolveCampaignRulesetOverrides` is the read side. The override object is
// hashed into the AuditResult identity tuple (`campaign_override_hash`, AD-4), so
// any override EDIT changes the hash and invalidates the affected Claim's cache.
//
// Story 3.1 delivers the SHAPE + the pure folder + the hash-stability guarantee.
// Persisting/editing overrides (a real store + the Proof Brief edit UI) is
// Story 3.2 — so `resolveCampaignRulesetOverrides` still returns an empty
// override (`{}`), which hashes identically to today and invalidates nothing.

/** A partial override layered on a campaign's default requirement set (AD-13).
 *  Keyed by requirement `kind` (unique within a default set). Empty object =
 *  "no override" (the default set stands, cache stays valid). */
export interface CampaignRulesetOverride {
  /** Re-classify these requirement kinds' criticality for this campaign. */
  criticality?: Readonly<Record<string, Criticality>>;
  /** Requirement kinds removed from the campaign's effective set. */
  removed?: readonly string[];
  /** Extra requirements added for this campaign only. */
  added?: readonly DefaultProofRequirement[];
}

/** Fold a partial override onto a default requirement list → the campaign's
 *  effective set (AD-13). Pure and order-preserving: removals first, then
 *  criticality re-classification, then appends. Never mutates its inputs. */
export function applyCampaignOverrides(
  defaults: readonly DefaultProofRequirement[],
  override: CampaignRulesetOverride,
): readonly DefaultProofRequirement[] {
  const removed = new Set(override.removed ?? []);
  const reclass = override.criticality ?? {};
  const kept = defaults
    .filter((req) => !removed.has(req.kind))
    .map((req) => (req.kind in reclass ? { ...req, criticality: reclass[req.kind] } : req));
  return [...kept, ...(override.added ?? [])];
}

/** Canonical form of an override for hashing into the AuditResult identity tuple
 *  (AD-4). `criticality` (a lookup map) and `removed` (consumed as a Set) are
 *  order-independent, so two reorderings of the SAME override must hash
 *  identically — otherwise re-saving an unchanged override in a different key
 *  order would spuriously miss the cache. Sorts map keys, sorts+dedupes
 *  `removed`, and treats `added` as an order-independent set (the verdict is
 *  set-based; only the effective requirements matter). Pure; never mutates. */
export function canonicalizeCampaignOverride(
  override: CampaignRulesetOverride,
): CampaignRulesetOverride {
  const out: CampaignRulesetOverride = {};
  if (override.criticality) {
    const sortedKeys = Object.keys(override.criticality).sort();
    out.criticality = Object.fromEntries(
      // biome-ignore lint/style/noNonNullAssertion: key comes from Object.keys
      sortedKeys.map((k) => [k, override.criticality![k]]),
    );
  }
  if (override.removed) {
    out.removed = [...new Set(override.removed)].sort();
  }
  if (override.added) {
    out.added = [...override.added]
      .map(canonicalizeRequirement)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return out;
}

/** Fixed key order for a requirement so canonicalization is serialization-stable. */
function canonicalizeRequirement(req: DefaultProofRequirement): DefaultProofRequirement {
  return {
    kind: req.kind,
    criticality: req.criticality,
    label: req.label,
    confirmed: req.confirmed,
  };
}

/** Per-campaign ruleset overrides (AD-13) — the read side of the seam. Empty
 *  until Story 3.2 wires a real override store + edit UI; exposed now so the
 *  cache identity's `campaign_override_hash` (AD-4) is stable and
 *  forward-compatible. A non-empty override hashes differently (through
 *  `canonicalizeCampaignOverride`), which is what invalidates the affected
 *  Claim's AuditResult cache. */
export function resolveCampaignRulesetOverrides(_campaignId: string): CampaignRulesetOverride {
  return {};
}

export {
  DEFAULT_REQUIREMENT_SETS,
  DELIVERABLE_TYPES_WITH_DEFAULTS,
  type DefaultProofRequirement,
  type DeliverableTypeDefaults,
  defaultRequirementsFor,
} from "./default-requirement-sets";
export {
  DELIVERABLE_TYPE,
  type DeliverableType,
} from "./deliverable-types";
export {
  FRANCE_EU_DISCLOSURE,
  FRANCE_EU_DISCLOSURES,
  type FranceEuDisclosure,
  type FranceEuDisclosureSpec,
  franceEuDisclosure,
  isFranceEuDisclosure,
} from "./france-eu-disclosures";
