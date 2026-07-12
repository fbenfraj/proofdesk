// src/services/proof-brief — the write + read orchestration behind the Proof
// Brief surface (Story 3.2, FR-3). The operator picks a Deliverable-type template
// (Story 3.1 default sets), then adds / edits / removes Proof Requirements per
// Deliverable. Thin shell between the Route Handlers and the repository (AD-2/
// AD-10): it never touches the DB driver and never calls the pure core.
//
// ROWS-AS-TRUTH (the load-bearing decision): the authored bar is persisted as
// `proof_requirement` rows — the SAME rows the snapshot assembler reads. So "the
// configured set is exactly what the Proof Audit evaluates against" (FR-3/FR-9)
// holds with no second source of truth, and an edit invalidates the AuditResult
// cache automatically through the evidence_snapshot_hash (requirements are part
// of AuditSnapshot.claim, AD-4). Story 3.1's CampaignRulesetOverride seam stays
// reserved/unwired — see the 3.2 story Dev Notes.
//
// HONESTY (AD-3/AD-19): a requirement's satisfaction type is resolved by
// `satisfactionTypeOf(kind)`; a screenshot/metric/viewer-figure kind is ALWAYS a
// Human assertion, and an unknown/custom kind falls to `human-assertion`. No path
// here lets an operator relabel such a kind as machine-verified.
//
// DELETE HAZARD (AC6): `proof_requirement.id` is FK-referenced by evidence_link,
// match_suggestion, and human_confirmation. Removing a requirement that has any
// dependent would orphan real operator evidence, so removal is REJECTED when
// dependents exist — the operator unassigns evidence first (Story 2.2).

import {
  createProofRequirement,
  type Db,
  deleteMatchSuggestionsForRequirement,
  deleteProofRequirement,
  getCampaign,
  getDeliverableRow,
  getProofRequirementRow,
  listProofRequirementsForDeliverable,
  proofRequirementHasDependents,
  setDisclosureState,
  updateProofRequirement,
} from "@/src/repositories";
import {
  DELIVERABLE_TYPE,
  type DeliverableType,
  defaultRequirementsFor,
  type FranceEuDisclosure,
  franceEuDisclosure,
  isFranceEuDisclosure,
  type SatisfactionType,
  satisfactionTypeOf,
} from "@/src/ruleset";
import type { Criticality, DisclosureState } from "@/src/schema";
import { listDeliverableOptions } from "./evidence-matching";

/** The resulting audit cap of a disclosure requirement's three-tier severity —
 *  derived for display so the Proof Brief shows the operator what a tier means
 *  (Story 3.3, mirrors the pure core's `evalDisclosure`; the core remains the
 *  sole verdict authority — this is a UI hint, never the verdict). `unassessed`
 *  = no tier yet (the core falls back to operator-confirmed evidence). */
export type DisclosureCap = "green-eligible" | "caps-yellow" | "caps-red" | "unassessed";

/** Mirror the pure core's `evalDisclosure` for display: a `missing` disclosure
 *  caps at Red only when CRITICAL — a supporting one caps at Yellow (never a
 *  false Red), matching the audit engine. */
export function disclosureCapOf(
  state: DisclosureState | null,
  criticality: Criticality,
): DisclosureCap {
  switch (state) {
    case "evidenced":
      return "green-eligible";
    case "ambiguous":
    case "partial":
      return "caps-yellow";
    case "missing":
      return criticality === "supporting" ? "caps-yellow" : "caps-red";
    default:
      return "unassessed";
  }
}

/** One authored requirement as the brief renders it. `satisfactionType` is
 *  derived (never stored) so the UI can be honest about what would satisfy it.
 *  For `disclosure` requirements, `disclosureState` carries the three-tier
 *  severity (Story 3.3) and `disclosureCap` its derived audit cap; both are null/
 *  omitted for non-disclosure kinds. */
export interface BriefRequirementView {
  id: string;
  kind: string;
  criticality: Criticality;
  label: string;
  satisfactionType: SatisfactionType;
  /** true when this is a disclosure requirement (satisfaction type `disclosure`)
   *  — the UI renders the three-tier severity control + the standing caveat. */
  isDisclosure: boolean;
  disclosureState: DisclosureState | null;
  /** The audit cap the current tier produces (display hint; null when not a
   *  disclosure requirement). */
  disclosureCap: DisclosureCap | null;
  /** Stable France/EU checklist key (Story 3.3) when this row is a known
   *  checklist item — the UI localizes the row name from it and the checklist
   *  disables an already-attached key. null for a generic/unknown disclosure. */
  disclosureKey: FranceEuDisclosure | null;
}

/** A Deliverable's slice of the brief. `isUnset` drives the proof-brief-unset
 *  empty state (prompt to pick a template; audits are blocked until a bar exists). */
export interface DeliverableBriefView {
  deliverableId: string;
  creatorName: string;
  /** Free-text Deliverable type (the operator's own words); the canonical
   *  template is picked transiently at prefill time, never persisted here. */
  deliverableType: string;
  isUnset: boolean;
  requirements: BriefRequirementView[];
}

/** A pickable template: the Story-3.1 default set for a canonical Deliverable
 *  type. `provisional` / `confirmed` carry the GATE b/3 honesty — the UI renders
 *  a "provisional — not yet confirmed" state; these defaults are never
 *  authoritative. */
export interface TemplateOptionView {
  deliverableType: DeliverableType;
  provisional: boolean;
  requirements: readonly {
    kind: string;
    criticality: Criticality;
    label: string;
    confirmed: boolean;
    satisfactionType: SatisfactionType;
  }[];
}

export interface ProofBriefView {
  campaignId: string;
  deliverables: DeliverableBriefView[];
  templates: TemplateOptionView[];
}

function toRequirementView(row: {
  id: string;
  kind: string;
  criticality: Criticality;
  label: string;
  disclosureState: DisclosureState | null;
  disclosureKey: string | null;
}): BriefRequirementView {
  const satisfactionType = satisfactionTypeOf(row.kind);
  const isDisclosure = satisfactionType === "disclosure";
  return {
    id: row.id,
    kind: row.kind,
    criticality: row.criticality,
    label: row.label,
    satisfactionType,
    isDisclosure,
    disclosureState: isDisclosure ? row.disclosureState : null,
    disclosureCap: isDisclosure ? disclosureCapOf(row.disclosureState, row.criticality) : null,
    disclosureKey: isFranceEuDisclosure(row.disclosureKey) ? row.disclosureKey : null,
  };
}

function deliverableBrief(db: Db, deliverableId: string): DeliverableBriefView | null {
  const row = getDeliverableRow(db, deliverableId);
  if (!row) return null;
  const requirements = listProofRequirementsForDeliverable(db, deliverableId).map(
    toRequirementView,
  );
  return {
    deliverableId: row.id,
    creatorName: row.creatorName,
    deliverableType: row.type,
    isUnset: requirements.length === 0,
    requirements,
  };
}

/** The template catalog, built entirely from the Story-3.1 constants — no second
 *  list of Deliverable types to drift. */
export function listTemplates(): TemplateOptionView[] {
  return DELIVERABLE_TYPE.map((type) => {
    const defaults = defaultRequirementsFor(type);
    return {
      deliverableType: type,
      provisional: defaults.provisional,
      requirements: defaults.requirements.map((r) => ({
        kind: r.kind,
        criticality: r.criticality,
        label: r.label,
        confirmed: r.confirmed,
        satisfactionType: satisfactionTypeOf(r.kind),
      })),
    };
  });
}

/** The whole Proof Brief for a Campaign: every Deliverable with its authored
 *  requirements (or unset), plus the pickable templates. Returns null for an
 *  unknown Campaign so the route can 404. */
export function getProofBrief(db: Db, campaignId: string): ProofBriefView | null {
  if (!getCampaign(db, campaignId)) return null;
  // Reuse the existing deterministic Deliverable read (ordered by creator/type/id).
  const deliverables: DeliverableBriefView[] = listDeliverableOptions(db, campaignId).map(
    (option) => {
      const requirements = listProofRequirementsForDeliverable(db, option.deliverableId).map(
        toRequirementView,
      );
      return {
        deliverableId: option.deliverableId,
        creatorName: option.creatorName,
        deliverableType: option.deliverableType,
        isUnset: requirements.length === 0,
        requirements,
      };
    },
  );
  return { campaignId, deliverables, templates: listTemplates() };
}

// --- Mutations ------------------------------------------------------------
//     Each returns the refreshed Deliverable brief in one round-trip (like
//     setClaimOverride), or a typed failure the route maps to an HTTP status.

export type BriefMutationResult =
  | { ok: true; view: DeliverableBriefView }
  | { ok: false; reason: "deliverable-not-found" }
  | { ok: false; reason: "requirement-not-found" }
  | { ok: false; reason: "has-dependents" }
  | { ok: false; reason: "already-set" }
  | { ok: false; reason: "not-disclosure" }
  | { ok: false; reason: "disclosure-already-attached" };

export interface AddRequirementInput {
  kind: string;
  criticality: Criticality;
  label: string;
}

/** Add one Proof Requirement to a Deliverable. The kind's satisfaction type is
 *  whatever `satisfactionTypeOf` says — a screenshot/metric/viewer kind stays a
 *  Human assertion; an unknown kind falls to human-assertion (never machine). */
export function addRequirement(
  db: Db,
  deliverableId: string,
  input: AddRequirementInput,
): BriefMutationResult {
  if (!getDeliverableRow(db, deliverableId)) return { ok: false, reason: "deliverable-not-found" };
  createProofRequirement(db, {
    deliverableId,
    kind: input.kind,
    criticality: input.criticality,
    label: input.label,
  });
  return refreshed(db, deliverableId);
}

export interface EditRequirementInput {
  criticality?: Criticality;
  label?: string;
}

/** The requirement, but only if it actually belongs to `deliverableId`. A scoped
 *  route (/deliverables/A/proof-requirements/<id>) must never mutate a
 *  requirement that lives under Deliverable B — a stale/malformed id is treated
 *  as not-found rather than silently editing another Deliverable's proof bar. */
function requirementOfDeliverable(
  db: Db,
  deliverableId: string,
  requirementId: string,
): ReturnType<typeof getProofRequirementRow> {
  const row = getProofRequirementRow(db, requirementId);
  if (!row || row.deliverableId !== deliverableId) return undefined;
  return row;
}

/** Edit a requirement in place (criticality and/or label) — id stays stable so
 *  linked evidence survives. A criticality change invalidates the cache; a
 *  label-only change is verdict-neutral. Scoped to `deliverableId`. */
export function editRequirement(
  db: Db,
  deliverableId: string,
  requirementId: string,
  patch: EditRequirementInput,
): BriefMutationResult {
  if (!requirementOfDeliverable(db, deliverableId, requirementId)) {
    return { ok: false, reason: "requirement-not-found" };
  }
  updateProofRequirement(db, requirementId, patch);
  return refreshed(db, deliverableId);
}

/** Remove a requirement — REJECTED when a REAL operator receipt (evidence_link /
 *  human_confirmation) references it (would orphan it; the operator unassigns
 *  first). Machine-generated match_suggestions never block: they are cleared
 *  first so the FK delete succeeds. Scoped to `deliverableId`. */
export function removeRequirement(
  db: Db,
  deliverableId: string,
  requirementId: string,
): BriefMutationResult {
  if (!requirementOfDeliverable(db, deliverableId, requirementId)) {
    return { ok: false, reason: "requirement-not-found" };
  }
  if (proofRequirementHasDependents(db, requirementId)) {
    return { ok: false, reason: "has-dependents" };
  }
  deleteMatchSuggestionsForRequirement(db, requirementId);
  deleteProofRequirement(db, requirementId);
  return refreshed(db, deliverableId);
}

/** Apply a Deliverable-type template — insert its Story-3.1 default set as rows.
 *  Only allowed when the Deliverable is currently UNSET (guard against
 *  double-apply); appending onto a non-empty set is an explicit `addRequirement`,
 *  not a template apply. */
export function applyTemplate(
  db: Db,
  deliverableId: string,
  deliverableType: DeliverableType,
): BriefMutationResult {
  if (!getDeliverableRow(db, deliverableId)) return { ok: false, reason: "deliverable-not-found" };
  if (listProofRequirementsForDeliverable(db, deliverableId).length > 0) {
    return { ok: false, reason: "already-set" };
  }
  for (const req of defaultRequirementsFor(deliverableType).requirements) {
    // The template's France/EU disclosure requirement is the baseline
    // "collaboration commerciale" checklist item — persist it KEYED (not a
    // keyless generic), so it dedups against a later checklist add and renders
    // its localized name. Without this a template + a checklist add would leave
    // two critical disclosures and keep the claim confusingly Red (Codex [P2]).
    const disclosureKey =
      satisfactionTypeOf(req.kind) === "disclosure" ? TEMPLATE_DISCLOSURE_KEY : null;
    createProofRequirement(db, {
      deliverableId,
      kind: req.kind,
      criticality: req.criticality,
      label: req.label,
      disclosureKey,
    });
  }
  return refreshed(db, deliverableId);
}

/** The baseline France/EU disclosure a Deliverable-type template pre-fills — the
 *  universally-required "collaboration commerciale" sponsored-content label. */
const TEMPLATE_DISCLOSURE_KEY: FranceEuDisclosure = "collaboration-commerciale";

/** Attach one France/EU disclosure requirement (collaboration commerciale /
 *  images retouchées / images virtuelles) to a Deliverable (Story 3.3, FR-4). Server-
 *  authoritative kind + label from the ruleset spec — the client only names the
 *  canonical key, never the kind/label, so a disclosure can never be spoofed into
 *  a machine-verified requirement. A Deliverable may carry several DIFFERENT
 *  disclosures, but the SAME checklist item is attached at most once: a duplicate
 *  is rejected (`disclosure-already-attached`) because a second, unassessed copy
 *  would silently re-introduce a Red/Yellow after the first was assessed. The
 *  severity is set separately and starts unassessed (null). */
export function addDisclosureRequirement(
  db: Db,
  deliverableId: string,
  key: FranceEuDisclosure,
): BriefMutationResult {
  if (!getDeliverableRow(db, deliverableId)) return { ok: false, reason: "deliverable-not-found" };
  const spec = franceEuDisclosure(key);
  // Dedup on the STABLE key, never the mutable display label — editing a label
  // must not let the same checklist item be attached twice (Codex [P2]).
  const alreadyAttached = listProofRequirementsForDeliverable(db, deliverableId).some(
    (r) => r.disclosureKey === key,
  );
  if (alreadyAttached) return { ok: false, reason: "disclosure-already-attached" };
  createProofRequirement(db, {
    deliverableId,
    kind: spec.kind,
    criticality: spec.criticality,
    label: spec.label,
    disclosureState: null,
    disclosureKey: spec.key,
  });
  return refreshed(db, deliverableId);
}

/** Set (or clear) a disclosure requirement's three-tier severity (Story 3.3). The
 *  tier is a Human assertion reviewing the evidence on file (AD-3) — it feeds the
 *  core's `evalDisclosure` and is verdict-affecting (cache invalidates via the
 *  snapshot hash, AD-4). Scoped to `deliverableId`; refuses a non-disclosure
 *  requirement (a tier is meaningless there). */
export function setDisclosureSeverity(
  db: Db,
  deliverableId: string,
  requirementId: string,
  state: DisclosureState | null,
): BriefMutationResult {
  const row = requirementOfDeliverable(db, deliverableId, requirementId);
  if (!row) return { ok: false, reason: "requirement-not-found" };
  if (satisfactionTypeOf(row.kind) !== "disclosure") return { ok: false, reason: "not-disclosure" };
  setDisclosureState(db, requirementId, state);
  return refreshed(db, deliverableId);
}

function refreshed(db: Db, deliverableId: string): BriefMutationResult {
  const view = deliverableBrief(db, deliverableId);
  if (!view) return { ok: false, reason: "deliverable-not-found" };
  return { ok: true, view };
}
