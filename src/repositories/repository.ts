// Repository operations + the write-time honesty guards (AD-9, AD-18). This is
// the imperative shell: it may read the clock (AD-11) and touch the driver via
// the `Db` handle. The single `data_origin` derivation site lives here
// (`inheritDataOrigin`) so origin is never back-computed in the export layer.
//
// Only the operations exercised by Story 1.3's seam/ownership tests are exposed;
// later stories add operations as they need them (AD-10). Notably, there is NO
// update/delete path for `human_confirmation` — it is append-only by
// construction (AD-18).

import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import {
  auditResult,
  type Criticality,
  campaign,
  caveat,
  claim,
  creator,
  type DataOrigin,
  type DisclosureState,
  deliverable,
  type EvidenceLinkSource,
  evidenceItem,
  evidenceLink,
  humanConfirmation,
  humanOverride,
  type IntakeKind,
  type LivenessLabel,
  type MachineOrHuman,
  matchSuggestion,
  type ProofStatus,
  proofRequirement,
  type ReportInclusionOverride,
  report,
  reportItem,
  type TraceEntry,
} from "@/src/schema";
import { client } from "@/src/schema/client";
import type { Db } from "./db";

// --- Errors ---------------------------------------------------------------

/** A child row's `data_origin` would differ from its Campaign's (AD-9). */
export class MixedOriginError extends Error {}
/** An update targeted an immutable Campaign field (AD-9). */
export class ImmutableFieldError extends Error {}
/** A HumanConfirmation was written with non-`human` provenance (AD-18). */
export class ProvenanceError extends Error {}

// --- The single data_origin derivation site (AD-9) ------------------------

export function resolveCampaignDataOrigin(db: Db, campaignId: string): DataOrigin {
  const row = db
    .select({ dataOrigin: campaign.dataOrigin })
    .from(campaign)
    .where(eq(campaign.id, campaignId))
    .get();
  if (!row) throw new Error(`Campaign not found: ${campaignId}`);
  return row.dataOrigin;
}

/**
 * Resolve the `data_origin` a child row must carry, inherited from its Campaign.
 * If the caller supplies a value that disagrees, the write is a mixed-origin
 * write and is rejected (AD-9). Callers should normally omit `provided`.
 */
export function inheritDataOrigin(db: Db, campaignId: string, provided?: DataOrigin): DataOrigin {
  const resolved = resolveCampaignDataOrigin(db, campaignId);
  if (provided !== undefined && provided !== resolved) {
    throw new MixedOriginError(
      `Mixed-origin write rejected: campaign ${campaignId} is '${resolved}', got '${provided}' (AD-9)`,
    );
  }
  return resolved;
}

/** Reject any non-`human` provenance for a HumanConfirmation (AD-18). */
export function assertHumanConfirmationIsHuman(value: MachineOrHuman): void {
  if (value !== "human") {
    throw new ProvenanceError(
      `HumanConfirmation.machine_or_human must be 'human', got '${value}' (AD-18)`,
    );
  }
}

// --- Parent-chain resolvers (origin is derived from the REAL parent, never a
//     caller-supplied campaignId, so a cross-campaign write cannot mis-stamp
//     data_origin while its foreign keys still pass, AD-9) ------------------

/** The Campaign that owns an EvidenceItem (its direct FK). */
export function campaignIdOfEvidenceItem(db: Db, evidenceItemId: string): string {
  const row = db
    .select({ campaignId: evidenceItem.campaignId })
    .from(evidenceItem)
    .where(eq(evidenceItem.id, evidenceItemId))
    .get();
  if (!row) throw new Error(`EvidenceItem not found: ${evidenceItemId}`);
  return row.campaignId;
}

/** The Campaign that owns a ProofRequirement, via its Deliverable. */
export function campaignIdOfProofRequirement(db: Db, proofRequirementId: string): string {
  const row = db
    .select({ campaignId: deliverable.campaignId })
    .from(proofRequirement)
    .innerJoin(deliverable, eq(proofRequirement.deliverableId, deliverable.id))
    .where(eq(proofRequirement.id, proofRequirementId))
    .get();
  if (!row) throw new Error(`ProofRequirement not found: ${proofRequirementId}`);
  return row.campaignId;
}

/** The Campaign that owns a Creator (its direct FK). */
export function campaignIdOfCreator(db: Db, creatorId: string): string {
  const row = db
    .select({ campaignId: creator.campaignId })
    .from(creator)
    .where(eq(creator.id, creatorId))
    .get();
  if (!row) throw new Error(`Creator not found: ${creatorId}`);
  return row.campaignId;
}

/** The Campaign that owns a Claim, via its Deliverable. */
export function campaignIdOfClaim(db: Db, claimId: string): string {
  const row = db
    .select({ campaignId: deliverable.campaignId })
    .from(claim)
    .innerJoin(deliverable, eq(claim.deliverableId, deliverable.id))
    .where(eq(claim.id, claimId))
    .get();
  if (!row) throw new Error(`Claim not found: ${claimId}`);
  return row.campaignId;
}

/** The Campaign that owns an EvidenceLink (via its EvidenceItem) and the
 *  ProofRequirement the link actually satisfies. */
export function contextOfEvidenceLink(
  db: Db,
  evidenceLinkId: string,
): { campaignId: string; proofRequirementId: string } {
  const row = db
    .select({
      campaignId: evidenceItem.campaignId,
      proofRequirementId: evidenceLink.proofRequirementId,
    })
    .from(evidenceLink)
    .innerJoin(evidenceItem, eq(evidenceLink.evidenceItemId, evidenceItem.id))
    .where(eq(evidenceLink.id, evidenceLinkId))
    .get();
  if (!row) throw new Error(`EvidenceLink not found: ${evidenceLinkId}`);
  return row;
}

// --- Roots (own their data_origin; not inherited) -------------------------

export function createClient(db: Db, name: string) {
  return db.insert(client).values({ name }).returning().get();
}

export interface NewCampaign {
  /** Normally omitted (auto-generated). The seed passes a stable id so a re-run
   *  can detect the existing demo Campaign and skip (idempotency). */
  id?: string;
  clientId: string;
  name: string;
  dataOrigin: DataOrigin;
  isDemo: boolean;
}

export function createCampaign(db: Db, values: NewCampaign) {
  return db.insert(campaign).values(values).returning().get();
}

/** Campaign fields that are set once and can never change (AD-9). */
const IMMUTABLE_CAMPAIGN_FIELDS = ["dataOrigin", "isDemo"] as const;

/** Update mutable Campaign fields only. Any attempt to change `data_origin` or
 *  `is_demo` is rejected (AD-9). `name` is the ONLY mutable field: the patch is
 *  never forwarded wholesale to the driver, so unrelated columns (e.g.
 *  `clientId`, which is ownership) can never be silently rewritten. */
export function updateCampaign(
  db: Db,
  id: string,
  patch: { name?: string } & Record<string, unknown>,
) {
  for (const field of IMMUTABLE_CAMPAIGN_FIELDS) {
    if (field in patch) {
      throw new ImmutableFieldError(`Campaign.${field} is immutable and cannot be updated (AD-9)`);
    }
  }
  // Whitelist: set only the declared mutable column, never the raw patch.
  if (patch.name === undefined) return;
  db.update(campaign).set({ name: patch.name }).where(eq(campaign.id, id)).run();
}

// --- Minimal parent chain (so tests can reach a Claim) --------------------

export function createCreator(db: Db, campaignId: string, name: string, handle?: string) {
  return db.insert(creator).values({ campaignId, name, handle }).returning().get();
}

export function createDeliverable(
  db: Db,
  values: {
    campaignId: string;
    creatorId: string;
    type: string;
    claimedStatus: string;
    platformUrl?: string;
  },
) {
  // The Creator must belong to the same Campaign; otherwise the Deliverable's
  // parent chain would split across campaigns and its Claims/ProofRequirements
  // would inherit a campaign the Creator is not part of (AD-9).
  const creatorCampaignId = campaignIdOfCreator(db, values.creatorId);
  if (creatorCampaignId !== values.campaignId) {
    throw new MixedOriginError(
      `Cross-campaign deliverable rejected: creator is in campaign ${creatorCampaignId}, deliverable declared ${values.campaignId} (AD-9)`,
    );
  }
  return db.insert(deliverable).values(values).returning().get();
}

export function createClaim(db: Db, deliverableId: string) {
  return db.insert(claim).values({ deliverableId }).returning().get();
}

export function createProofRequirement(
  db: Db,
  values: {
    deliverableId: string;
    kind: string;
    criticality: "critical" | "supporting";
    /** Human-readable brief text (Story 3.2). Optional — defaults to `''` so
     *  existing callers (the seed) keep compiling; display-only, never in the
     *  AuditSnapshot. */
    label?: string;
    /** Three-tier disclosure severity (Story 3.3). Optional — defaults to null
     *  (unassessed / not a disclosure requirement). Verdict-affecting for
     *  `disclosure` kinds via the AuditSnapshot. */
    disclosureState?: DisclosureState | null;
    /** Stable France/EU checklist identity (Story 3.3). Optional — defaults to
     *  null; set only for a checklist-attached disclosure. Verdict-neutral. */
    disclosureKey?: string | null;
  },
) {
  return db
    .insert(proofRequirement)
    .values({
      ...values,
      label: values.label ?? "",
      disclosureState: values.disclosureState ?? null,
      disclosureKey: values.disclosureKey ?? null,
    })
    .returning()
    .get();
}

// --- Exportable children (data_origin inherited via the single site) ------

export interface NewEvidenceItem {
  /** Optional explicit id. The ingest service sets it so a file can be stored
   *  under a storage key derived from the row id BEFORE the insert. Omitted
   *  elsewhere → the `pk()` default generates one. */
  id?: string;
  campaignId: string;
  type: string;
  machineOrHuman: MachineOrHuman;
  /** How the receipt was captured (Story 2.1). Omitted on abstract seed rows. */
  intakeKind?: IntakeKind;
  /** Payload columns — exactly one is populated per intake kind (Story 2.1).
   *  `url`/`note` for link/text; `storageKey`+`contentType`+`originalFilename`
   *  for `image`/`metric` file uploads. */
  url?: string;
  note?: string;
  storageKey?: string;
  contentType?: string;
  originalFilename?: string;
  /** Server-authoritative; defaults to server `now` (AD-11). */
  uploadedAt?: string;
  clientCapturedAt?: string;
  /** Last-known four-value liveness (AD-5, AD-7); omit when no check has run. */
  livenessLabel?: LivenessLabel;
  dataOrigin?: DataOrigin;
}

export function createEvidenceItem(db: Db, values: NewEvidenceItem) {
  const dataOrigin = inheritDataOrigin(db, values.campaignId, values.dataOrigin);
  return db
    .insert(evidenceItem)
    .values({
      ...(values.id ? { id: values.id } : {}),
      campaignId: values.campaignId,
      type: values.type,
      machineOrHuman: values.machineOrHuman,
      intakeKind: values.intakeKind,
      url: values.url,
      note: values.note,
      storageKey: values.storageKey,
      contentType: values.contentType,
      originalFilename: values.originalFilename,
      uploadedAt: values.uploadedAt ?? new Date().toISOString(),
      clientCapturedAt: values.clientCapturedAt,
      livenessLabel: values.livenessLabel,
      dataOrigin,
    })
    .returning()
    .get();
}

/** The result of one SSRF-hardened liveness check, ready to persist (Story 2.4).
 *  `status` is the raw HTTP status as text (NULL when no response was received —
 *  DNS/SSRF/transport failure). `checkedAt` is server-UTC (AD-11), stamped by the
 *  shell, never the core. */
export interface EvidenceLivenessUpdate {
  label: LivenessLabel;
  status?: string | null;
  finalUrl?: string | null;
  reason?: string | null;
  checkedAt?: string;
}

/** Write the last-known four-value liveness label + its audit trail onto an
 *  EvidenceItem (Story 2.4, AD-5/AD-7). This is the Epic-2 liveness writer the
 *  schema comment foretold.
 *
 *  AD-18 GUARD: this updates ONLY the evidence_item liveness columns. A liveness
 *  re-check may invalidate the *link*, but it must NEVER mutate or delete a
 *  `HumanConfirmation` row, nor smear `machine` provenance onto a human-written
 *  one — so this function deliberately touches no other table. There remains NO
 *  update/delete path for `human_confirmation` anywhere in this repository.
 *
 *  Returns the updated row, or `undefined` when no EvidenceItem has that id. */
export function updateEvidenceLiveness(
  db: Db,
  evidenceItemId: string,
  update: EvidenceLivenessUpdate,
) {
  return db
    .update(evidenceItem)
    .set({
      livenessLabel: update.label,
      livenessStatus: update.status ?? null,
      livenessFinalUrl: update.finalUrl ?? null,
      livenessReason: update.reason ?? null,
      livenessCheckedAt: update.checkedAt ?? new Date().toISOString(),
    })
    .where(eq(evidenceItem.id, evidenceItemId))
    .returning()
    .get();
}

export interface NewEvidenceLink {
  evidenceItemId: string;
  proofRequirementId: string;
  source: EvidenceLinkSource;
  /** Optional cross-check; the true origin is derived from the parent chain. */
  dataOrigin?: DataOrigin;
}

/** Link an EvidenceItem to a ProofRequirement. The campaign (and thus
 *  data_origin) is derived from the EvidenceItem's own parent; if the
 *  ProofRequirement belongs to a DIFFERENT campaign the link is a cross-campaign
 *  mixed-origin write and is rejected (AD-9). */
export function createEvidenceLink(db: Db, values: NewEvidenceLink) {
  const itemCampaignId = campaignIdOfEvidenceItem(db, values.evidenceItemId);
  const reqCampaignId = campaignIdOfProofRequirement(db, values.proofRequirementId);
  if (itemCampaignId !== reqCampaignId) {
    throw new MixedOriginError(
      `Cross-campaign link rejected: evidence item is in campaign ${itemCampaignId}, requirement in ${reqCampaignId} (AD-9)`,
    );
  }
  const dataOrigin = inheritDataOrigin(db, itemCampaignId, values.dataOrigin);
  return db
    .insert(evidenceLink)
    .values({
      evidenceItemId: values.evidenceItemId,
      proofRequirementId: values.proofRequirementId,
      source: values.source,
      dataOrigin,
    })
    .returning()
    .get();
}

export interface NewCaveat {
  claimId: string;
  text: string;
  authoredBy: string;
  /** Normally omitted; a disagreeing value triggers MixedOriginError (AD-9). */
  dataOrigin?: DataOrigin;
}

export function createCaveat(db: Db, values: NewCaveat) {
  const campaignId = campaignIdOfClaim(db, values.claimId);
  const dataOrigin = inheritDataOrigin(db, campaignId, values.dataOrigin);
  return db
    .insert(caveat)
    .values({
      claimId: values.claimId,
      text: values.text,
      authoredBy: values.authoredBy,
      dataOrigin,
    })
    .returning()
    .get();
}

export interface NewHumanConfirmation {
  evidenceLinkId: string;
  confirmedBy: string;
  /** UTC ISO-8601; defaults to server `now`. */
  confirmedAt?: string;
}

/** Append a HumanConfirmation. Insert-only (append-only, AD-18); provenance is
 *  forced to `human` and validated (AD-18). The ProofRequirement and the
 *  campaign (thus data_origin) are derived from the EvidenceLink itself, so a
 *  confirmation can never be filed against a requirement the link does not
 *  satisfy. */
export function appendHumanConfirmation(db: Db, values: NewHumanConfirmation) {
  const { campaignId, proofRequirementId } = contextOfEvidenceLink(db, values.evidenceLinkId);
  const dataOrigin = inheritDataOrigin(db, campaignId);
  const machineOrHuman: MachineOrHuman = "human";
  assertHumanConfirmationIsHuman(machineOrHuman);
  return db
    .insert(humanConfirmation)
    .values({
      evidenceLinkId: values.evidenceLinkId,
      proofRequirementId,
      confirmedBy: values.confirmedBy,
      confirmedAt: values.confirmedAt ?? new Date().toISOString(),
      machineOrHuman,
      dataOrigin,
    })
    .returning()
    .get();
}

// --- Read helpers (so tests never touch the driver directly) --------------

export function getCampaign(db: Db, id: string) {
  return db.select().from(campaign).where(eq(campaign.id, id)).get();
}

export function getEvidenceItem(db: Db, id: string) {
  return db.select().from(evidenceItem).where(eq(evidenceItem.id, id)).get();
}

export function getHumanConfirmation(db: Db, id: string) {
  return db.select().from(humanConfirmation).where(eq(humanConfirmation.id, id)).get();
}

export function getCaveat(db: Db, id: string) {
  return db.select().from(caveat).where(eq(caveat.id, id)).get();
}

/** All Caveats authored against a Claim (append-only, 1..*, AD-18). Ordered by
 *  id so the render is deterministic — the caveat table carries no timestamp and
 *  the pk is a random UUID, so id-order is stable-but-not-chronological, which is
 *  all the display + export need (order is not a domain fact here). Consumed by
 *  the Claim Card drawer and the effective-Yellow report-includability gate (the
 *  gate itself is enforced in the export layer, Epic 4 — AD-20/21). */
export function listCaveatsForClaim(db: Db, claimId: string) {
  return db.select().from(caveat).where(eq(caveat.claimId, claimId)).orderBy(asc(caveat.id)).all();
}

// --- Campaign-scoped list reads (used by the seed test to sweep honesty
//     columns, and by the Story-1.5 snapshot assembler) ---------------------

/** All EvidenceItems in a Campaign — including the abstract Epic-1 seed rows
 *  (used by the seed honesty sweep and the Story-1.5 snapshot assembler). */
export function listEvidenceItems(db: Db, campaignId: string) {
  return db.select().from(evidenceItem).where(eq(evidenceItem.campaignId, campaignId)).all();
}

/** Inbox receipts in a Campaign — only items actually ingested through the Story
 *  2.1 Evidence Inbox (`intake_kind` set). The abstract Epic-1 seed rows (linked
 *  proof evidence, `intake_kind IS NULL`) are NOT inbox receipts and are excluded
 *  so they never render as empty inbox cards or inflate the rail badge. Read-only.
 *  (Until matching lands in Story 2.2 every ingested item is unassigned; this is
 *  the "unassigned/new" set the inbox + badge show.) */
export function listInboxEvidenceItems(db: Db, campaignId: string) {
  return db
    .select()
    .from(evidenceItem)
    .where(and(eq(evidenceItem.campaignId, campaignId), isNotNull(evidenceItem.intakeKind)))
    .all();
}

/** Count of Evidence Inbox receipts in a Campaign — the rail badge (Story 2.1).
 *  Scoped to ingested items (see `listInboxEvidenceItems`). Read-only. */
export function countEvidenceItems(db: Db, campaignId: string): number {
  return listInboxEvidenceItems(db, campaignId).length;
}

/** All EvidenceLinks in a Campaign (scoped via each link's EvidenceItem). */
export function listEvidenceLinks(db: Db, campaignId: string) {
  return db
    .select({
      id: evidenceLink.id,
      evidenceItemId: evidenceLink.evidenceItemId,
      proofRequirementId: evidenceLink.proofRequirementId,
      source: evidenceLink.source,
      dataOrigin: evidenceLink.dataOrigin,
    })
    .from(evidenceLink)
    .innerJoin(evidenceItem, eq(evidenceLink.evidenceItemId, evidenceItem.id))
    .where(eq(evidenceItem.campaignId, campaignId))
    .all();
}

/** All HumanConfirmations in a Campaign (scoped via link → item). */
export function listHumanConfirmations(db: Db, campaignId: string) {
  return db
    .select({
      id: humanConfirmation.id,
      evidenceLinkId: humanConfirmation.evidenceLinkId,
      proofRequirementId: humanConfirmation.proofRequirementId,
      confirmedBy: humanConfirmation.confirmedBy,
      confirmedAt: humanConfirmation.confirmedAt,
      machineOrHuman: humanConfirmation.machineOrHuman,
      dataOrigin: humanConfirmation.dataOrigin,
    })
    .from(humanConfirmation)
    .innerJoin(evidenceLink, eq(humanConfirmation.evidenceLinkId, evidenceLink.id))
    .innerJoin(evidenceItem, eq(evidenceLink.evidenceItemId, evidenceItem.id))
    .where(eq(evidenceItem.campaignId, campaignId))
    .all();
}

/** Count of MatchSuggestions in a Campaign — must be 0 for the seeded demo,
 *  since only operator-affirmed EvidenceLinks feed the audit (AD-17). */
export function countMatchSuggestions(db: Db, campaignId: string): number {
  return db
    .select({ id: matchSuggestion.id })
    .from(matchSuggestion)
    .innerJoin(evidenceItem, eq(matchSuggestion.evidenceItemId, evidenceItem.id))
    .where(eq(evidenceItem.campaignId, campaignId))
    .all().length;
}

// --- Story 2.2: deterministic matching writes + reads (FR-6, AD-17) --------
//     The matcher writes a MatchSuggestion ONLY; only an operator affirmation
//     writes an `EvidenceLink source=operator`, and ONLY those enter the
//     AuditSnapshot (see listOperatorEvidenceForClaim). A MatchSuggestion can
//     never lift a verdict; the core never sees suggestions.

export interface NewMatchSuggestion {
  evidenceItemId: string;
  proofRequirementId: string;
  /** The deterministic rule that fired (auditable provenance, NOT a score). */
  rule: string;
}

/** Write the matcher's MatchSuggestion (deterministic; no score/rank — AD-17).
 *  Rejects a cross-campaign suggestion (item vs requirement) as createEvidenceLink
 *  does (AD-9), though the row itself carries no data_origin. */
export function createMatchSuggestion(db: Db, values: NewMatchSuggestion) {
  const itemCampaignId = campaignIdOfEvidenceItem(db, values.evidenceItemId);
  const reqCampaignId = campaignIdOfProofRequirement(db, values.proofRequirementId);
  if (itemCampaignId !== reqCampaignId) {
    throw new MixedOriginError(
      `Cross-campaign suggestion rejected: evidence item in ${itemCampaignId}, requirement in ${reqCampaignId} (AD-9)`,
    );
  }
  return db
    .insert(matchSuggestion)
    .values({
      evidenceItemId: values.evidenceItemId,
      proofRequirementId: values.proofRequirementId,
      rule: values.rule,
    })
    .returning()
    .get();
}

/** Remove all MatchSuggestions for an EvidenceItem — the matcher keeps at most
 *  one (idempotent re-match), and affirmation consumes it. */
export function deleteMatchSuggestionsForEvidence(db: Db, evidenceItemId: string): void {
  db.delete(matchSuggestion).where(eq(matchSuggestion.evidenceItemId, evidenceItemId)).run();
}

/** The 0..1 MatchSuggestion for an item, joined to its Deliverable + Creator and
 *  carrying the fired rule — the inbox suggested-match card. Lowest id wins
 *  deterministically if several exist. Read-only. */
export function getMatchSuggestionForEvidence(db: Db, evidenceItemId: string) {
  return db
    .select({
      matchSuggestionId: matchSuggestion.id,
      proofRequirementId: matchSuggestion.proofRequirementId,
      rule: matchSuggestion.rule,
      deliverableId: deliverable.id,
      creatorName: creator.name,
      deliverableType: deliverable.type,
    })
    .from(matchSuggestion)
    .innerJoin(proofRequirement, eq(matchSuggestion.proofRequirementId, proofRequirement.id))
    .innerJoin(deliverable, eq(proofRequirement.deliverableId, deliverable.id))
    .innerJoin(creator, eq(deliverable.creatorId, creator.id))
    .where(eq(matchSuggestion.evidenceItemId, evidenceItemId))
    .orderBy(asc(matchSuggestion.id))
    .get();
}

/** The 0..1 operator EvidenceLink assignment for an item, joined to its
 *  Deliverable + Creator. `suggested` links are excluded (AD-17). Read-only. */
export function getOperatorAssignmentForEvidence(db: Db, evidenceItemId: string) {
  return db
    .select({
      evidenceLinkId: evidenceLink.id,
      proofRequirementId: evidenceLink.proofRequirementId,
      deliverableId: deliverable.id,
      creatorName: creator.name,
      deliverableType: deliverable.type,
    })
    .from(evidenceLink)
    .innerJoin(proofRequirement, eq(evidenceLink.proofRequirementId, proofRequirement.id))
    .innerJoin(deliverable, eq(proofRequirement.deliverableId, deliverable.id))
    .innerJoin(creator, eq(deliverable.creatorId, creator.id))
    .where(
      and(eq(evidenceLink.evidenceItemId, evidenceItemId), eq(evidenceLink.source, "operator")),
    )
    .orderBy(asc(evidenceLink.id))
    .get();
}

/** Delete an item's `source=operator` EvidenceLinks — the Reassign/Unassign
 *  reversal (NFR-D7), and how assign keeps exactly one operator link per item.
 *  `suggested` links are never touched (AD-17). */
export function deleteOperatorEvidenceLinksForItem(db: Db, evidenceItemId: string): void {
  db.delete(evidenceLink)
    .where(
      and(eq(evidenceLink.evidenceItemId, evidenceItemId), eq(evidenceLink.source, "operator")),
    )
    .run();
}

export interface MatchCandidateRow {
  deliverableId: string;
  creatorName: string;
  creatorHandle: string | null;
  deliverableType: string;
  platformUrl: string | null;
}

/** All Deliverables in a Campaign with their two matcher keys (creator handle,
 *  platform URL) — the deterministic matcher's candidate set (Story 2.2). One
 *  row per Deliverable, ordered deterministically by id. Read-only. */
export function listDeliverableMatchCandidates(db: Db, campaignId: string): MatchCandidateRow[] {
  return db
    .select({
      deliverableId: deliverable.id,
      creatorName: creator.name,
      creatorHandle: creator.handle,
      deliverableType: deliverable.type,
      platformUrl: deliverable.platformUrl,
    })
    .from(deliverable)
    .innerJoin(creator, eq(deliverable.creatorId, creator.id))
    .where(eq(deliverable.campaignId, campaignId))
    .orderBy(asc(deliverable.id))
    .all();
}

/** The ProofRequirement an affirmed match links to for a Deliverable (blocker
 *  #2 — the ONE place this decision lives). A Deliverable has 1..* requirements;
 *  a link/URL receipt attaches to the canonical proof-of-posting requirement.
 *  Precedence: kind `proof-of-posting` → else the first `critical` → else the
 *  first (deterministic by id). Returns undefined for a Deliverable with no
 *  requirements (or an unknown id). */
export function matchTargetRequirementId(db: Db, deliverableId: string): string | undefined {
  const reqs = db
    .select({
      id: proofRequirement.id,
      kind: proofRequirement.kind,
      criticality: proofRequirement.criticality,
    })
    .from(proofRequirement)
    .where(eq(proofRequirement.deliverableId, deliverableId))
    .orderBy(asc(proofRequirement.id))
    .all();
  if (reqs.length === 0) return undefined;
  return (
    reqs.find((r) => r.kind === "proof-of-posting")?.id ??
    reqs.find((r) => r.criticality === "critical")?.id ??
    reqs[0].id
  );
}

// --- Campaign Board read (Story 1.6) --------------------------------------
//     One joined row per Deliverable for the claimed-vs-proven ledger: the
//     Claim id (so status resolves through the ONE resolver, AD-6), plus the
//     Creator name, Deliverable type and the human-set claimed marker. Status is
//     deliberately NOT read here — the board service resolves it per Claim so a
//     pre-audit Claim can show `pending` without triggering the recompute path.

export interface BoardRow {
  claimId: string;
  deliverableId: string;
  creatorName: string;
  deliverableType: string;
  claimedStatus: string;
}

/** The ledger rows for a Campaign: Claim ⋈ Deliverable ⋈ Creator. Ordered
 *  deterministically (creator, then type, then id) so the board render is stable
 *  — determinism is a project value, never insertion order (AD-2/AD-10: this is
 *  the only Drizzle-touching layer). */
export function listCampaignBoardRows(db: Db, campaignId: string): BoardRow[] {
  return db
    .select({
      claimId: claim.id,
      deliverableId: deliverable.id,
      creatorName: creator.name,
      deliverableType: deliverable.type,
      claimedStatus: deliverable.claimedStatus,
    })
    .from(claim)
    .innerJoin(deliverable, eq(claim.deliverableId, deliverable.id))
    .innerJoin(creator, eq(deliverable.creatorId, creator.id))
    .where(eq(deliverable.campaignId, campaignId))
    .orderBy(asc(creator.name), asc(deliverable.type), asc(deliverable.id))
    .all();
}

// --- Proof Brief authoring reads/writes (Story 3.2) -----------------------
//     The authored bar is persisted as `proof_requirement` rows per Deliverable
//     — the SAME rows the snapshot assembler reads (rows-as-truth), so "the
//     configured set is exactly what the audit evaluates" holds with no second
//     source of truth, and edits invalidate the AuditResult cache through the
//     evidence_snapshot_hash automatically (AD-4). This is the only Drizzle
//     layer (AD-10); the proof-brief service orchestrates on top.

export interface BriefRequirementRow {
  id: string;
  kind: string;
  criticality: Criticality;
  label: string;
  /** Three-tier disclosure severity (Story 3.3); null for non-disclosure
   *  requirements and until an operator assesses a tier. */
  disclosureState: DisclosureState | null;
  /** Stable France/EU checklist identity (Story 3.3); null for non-checklist
   *  requirements. Drives dedup + the localized row name. */
  disclosureKey: string | null;
}

/** A Deliverable's authored ProofRequirements, deterministically ordered by id.
 *  Empty array for an unset Deliverable (or unknown id) — the caller renders the
 *  proof-brief-unset state. */
export function listProofRequirementsForDeliverable(
  db: Db,
  deliverableId: string,
): BriefRequirementRow[] {
  return db
    .select({
      id: proofRequirement.id,
      kind: proofRequirement.kind,
      criticality: proofRequirement.criticality,
      label: proofRequirement.label,
      disclosureState: proofRequirement.disclosureState,
      disclosureKey: proofRequirement.disclosureKey,
    })
    .from(proofRequirement)
    .where(eq(proofRequirement.deliverableId, deliverableId))
    .orderBy(asc(proofRequirement.id))
    .all();
}

export interface DeliverableRow {
  id: string;
  campaignId: string;
  creatorName: string;
  type: string;
}

/** A Deliverable with its campaign + creator display fields, or undefined for an
 *  unknown id (→ the route returns 404). */
export function getDeliverableRow(db: Db, deliverableId: string): DeliverableRow | undefined {
  return db
    .select({
      id: deliverable.id,
      campaignId: deliverable.campaignId,
      creatorName: creator.name,
      type: deliverable.type,
    })
    .from(deliverable)
    .innerJoin(creator, eq(deliverable.creatorId, creator.id))
    .where(eq(deliverable.id, deliverableId))
    .get();
}

/** A single ProofRequirement with the Deliverable it belongs to, or undefined. */
export function getProofRequirementRow(
  db: Db,
  requirementId: string,
): (BriefRequirementRow & { deliverableId: string }) | undefined {
  return db
    .select({
      id: proofRequirement.id,
      deliverableId: proofRequirement.deliverableId,
      kind: proofRequirement.kind,
      criticality: proofRequirement.criticality,
      label: proofRequirement.label,
      disclosureState: proofRequirement.disclosureState,
      disclosureKey: proofRequirement.disclosureKey,
    })
    .from(proofRequirement)
    .where(eq(proofRequirement.id, requirementId))
    .get();
}

/** Set (or clear) a ProofRequirement's three-tier disclosure severity in place
 *  by id (Story 3.3). An in-place UPDATE keeps the row id stable, so any linked
 *  evidence survives. This IS verdict-affecting (unlike a label edit): the tier
 *  flows into the AuditSnapshot, so the AuditResult cache invalidates through
 *  evidence_snapshot_hash on the next run (AD-4). Pass null to clear. */
export function setDisclosureState(
  db: Db,
  requirementId: string,
  state: DisclosureState | null,
): void {
  db.update(proofRequirement)
    .set({ disclosureState: state })
    .where(eq(proofRequirement.id, requirementId))
    .run();
}

/** Edit a ProofRequirement in place (criticality and/or label). Editing by id
 *  keeps the row's id stable, so any linked EvidenceLink / HumanConfirmation
 *  survives the edit — never delete-and-reinsert. A criticality change flows into
 *  the AuditSnapshot (cache invalidates, AD-4); a label-only change is
 *  verdict-neutral (label is not in the snapshot). */
export function updateProofRequirement(
  db: Db,
  requirementId: string,
  patch: { criticality?: Criticality; label?: string },
): void {
  const set: { criticality?: Criticality; label?: string } = {};
  if (patch.criticality !== undefined) set.criticality = patch.criticality;
  if (patch.label !== undefined) set.label = patch.label;
  if (Object.keys(set).length === 0) return;
  db.update(proofRequirement).set(set).where(eq(proofRequirement.id, requirementId)).run();
}

/** Clear all machine-generated MatchSuggestions pointing at a ProofRequirement.
 *  Suggestions are transient matcher output (AD-17, no operator meaning, freely
 *  regenerable), so removing a requirement clears them rather than being blocked
 *  by them — and this must run BEFORE `deleteProofRequirement` or the FK aborts. */
export function deleteMatchSuggestionsForRequirement(db: Db, requirementId: string): void {
  db.delete(matchSuggestion).where(eq(matchSuggestion.proofRequirementId, requirementId)).run();
}

/** Delete a ProofRequirement by id. The caller MUST first ensure it has no REAL
 *  dependents (see `proofRequirementHasDependents`) and clear any transient
 *  match_suggestion rows (see `deleteMatchSuggestionsForRequirement`) — otherwise
 *  the FK from evidence_link / match_suggestion / human_confirmation aborts the
 *  delete, and orphaning real operator evidence is never acceptable (AC6). */
export function deleteProofRequirement(db: Db, requirementId: string): void {
  db.delete(proofRequirement).where(eq(proofRequirement.id, requirementId)).run();
}

/** True when a REAL operator receipt references this ProofRequirement — an
 *  operator `evidence_link` or a `human_confirmation`. Removing such a
 *  requirement would orphan real evidence, so the proof-brief service refuses it
 *  (the operator unassigns evidence first, Story 2.2). Machine-generated
 *  `match_suggestion` rows are deliberately EXCLUDED: they carry no operator
 *  decision and there is no UI to clear them, so they must never make a
 *  requirement undeletable — `removeRequirement` clears them instead. */
export function proofRequirementHasDependents(db: Db, requirementId: string): boolean {
  const link = db
    .select({ id: evidenceLink.id })
    .from(evidenceLink)
    .where(eq(evidenceLink.proofRequirementId, requirementId))
    .get();
  if (link) return true;
  const confirmation = db
    .select({ id: humanConfirmation.id })
    .from(humanConfirmation)
    .where(eq(humanConfirmation.proofRequirementId, requirementId))
    .get();
  return confirmation !== undefined;
}

// --- Claim-scoped reads for the Story-1.5 snapshot assembler (AD-16) -------
//     One assembler is the SOLE producer of AuditSnapshot; these reads give it
//     exactly a Claim's requirements, its operator-only evidence (AD-17), and
//     its human confirmations (AD-18) — no more.

/** The ProofRequirements of a Claim (via its Deliverable). `disclosureState` is
 *  the pre-resolved three-tier severity for `disclosure` requirements (Story
 *  3.3); null for every other kind and until an operator assesses a tier. */
export function listProofRequirementsForClaim(db: Db, claimId: string) {
  return db
    .select({
      id: proofRequirement.id,
      kind: proofRequirement.kind,
      criticality: proofRequirement.criticality,
      disclosureState: proofRequirement.disclosureState,
    })
    .from(proofRequirement)
    .innerJoin(deliverable, eq(proofRequirement.deliverableId, deliverable.id))
    .innerJoin(claim, eq(claim.deliverableId, deliverable.id))
    .where(eq(claim.id, claimId))
    .all();
}

/** A Claim's `source = operator` EvidenceLinks with their EvidenceItem's
 *  liveness label. `suggested` links and MatchSuggestions are excluded here, so
 *  they can never enter the snapshot or lift a verdict (AD-17). */
export function listOperatorEvidenceForClaim(db: Db, claimId: string) {
  return db
    .select({
      proofRequirementId: evidenceLink.proofRequirementId,
      evidenceLinkId: evidenceLink.id,
      livenessLabel: evidenceItem.livenessLabel,
    })
    .from(evidenceLink)
    .innerJoin(evidenceItem, eq(evidenceLink.evidenceItemId, evidenceItem.id))
    .innerJoin(proofRequirement, eq(evidenceLink.proofRequirementId, proofRequirement.id))
    .innerJoin(deliverable, eq(proofRequirement.deliverableId, deliverable.id))
    .innerJoin(claim, eq(claim.deliverableId, deliverable.id))
    .where(and(eq(claim.id, claimId), eq(evidenceLink.source, "operator")))
    .all();
}

// --- Report + ReportItem writes/reads (Story 4.1, AD-20/AD-21) -------------
//     A Report pins ONE campaign-wide `evidence_snapshot_hash` at creation; new
//     evidence → a NEW version, never a mutation. ReportItem stores ONLY the
//     operator's inclusion INTENT (`inclusion_override`/`overridden_by`) — no
//     status, no materialized inclusion, no audience (all DERIVED at read time,
//     AD-21 + Epic-3 retro AI-3). `data_origin` is inherited at the single site.

/** The highest existing Report version for a Campaign, or 0 when none exist —
 *  the next version is `maxReportVersion + 1` (AC1: new evidence never mutates an
 *  in-flight report, it mints the next version). */
export function maxReportVersion(db: Db, campaignId: string): number {
  const row = db
    .select({ version: report.version })
    .from(report)
    .where(eq(report.campaignId, campaignId))
    .orderBy(desc(report.version))
    .get();
  return row?.version ?? 0;
}

export interface NewReport {
  campaignId: string;
  version: number;
  /** Frozen campaign-wide hash pinned at creation (AD-20). */
  evidenceSnapshotHash: string;
  /** Server-UTC ISO-8601 (AD-11). */
  createdAt: string;
}

/** Insert a Report, inheriting `data_origin` from its Campaign at the single
 *  site (AD-9) — the immutable root the Epic-4 export hard-wall reads (Story 4.4). */
export function createReport(db: Db, values: NewReport) {
  const dataOrigin = inheritDataOrigin(db, values.campaignId);
  return db
    .insert(report)
    .values({
      campaignId: values.campaignId,
      version: values.version,
      evidenceSnapshotHash: values.evidenceSnapshotHash,
      createdAt: values.createdAt,
      dataOrigin,
    })
    .returning()
    .get();
}

/** Insert a ReportItem for a Claim (override null = follow the status default).
 *  `data_origin` is inherited from the Claim's Campaign (AD-9). */
export function createReportItem(db: Db, values: { reportId: string; claimId: string }) {
  const campaignId = campaignIdOfClaim(db, values.claimId);
  const dataOrigin = inheritDataOrigin(db, campaignId);
  return db
    .insert(reportItem)
    .values({
      reportId: values.reportId,
      claimId: values.claimId,
      inclusionOverride: null,
      overriddenBy: null,
      dataOrigin,
    })
    .returning()
    .get();
}

export function getReport(db: Db, reportId: string) {
  return db.select().from(report).where(eq(report.id, reportId)).get();
}

/** The latest (highest-version) Report for a Campaign, or undefined when none. */
export function getLatestReport(db: Db, campaignId: string) {
  return db
    .select()
    .from(report)
    .where(eq(report.campaignId, campaignId))
    .orderBy(desc(report.version))
    .get();
}

export function getReportItem(db: Db, reportItemId: string) {
  return db.select().from(reportItem).where(eq(reportItem.id, reportItemId)).get();
}

/** A Report's items, ordered by id for a deterministic render. */
export function listReportItems(db: Db, reportId: string) {
  return db
    .select()
    .from(reportItem)
    .where(eq(reportItem.reportId, reportId))
    .orderBy(asc(reportItem.id))
    .all();
}

/** Set (or clear) a ReportItem's operator inclusion override in place by id — the
 *  row stays stable. `null` clears BOTH the override and its attribution (back to
 *  the status default). Only the two declared columns are ever written; the raw
 *  patch is never forwarded (cf. `updateCampaign`). The status/inclusion the item
 *  resolves to is never stored — it is re-derived on read (AD-21). */
export function setReportItemInclusion(
  db: Db,
  reportItemId: string,
  override: ReportInclusionOverride | null,
  overriddenBy: string | null,
): void {
  db.update(reportItem)
    .set({
      inclusionOverride: override,
      // Attribution only lives alongside an override; clearing the override clears it.
      overriddenBy: override === null ? null : overriddenBy,
    })
    .where(eq(reportItem.id, reportItemId))
    .run();
}

/** Set the per-report ProofDesk-byline removal flag in place by id (Story 4.2,
 *  FR-12). Presentation-only intent — it writes ONLY `byline_removed` and touches
 *  nothing status-shaped (the appendix is assembled independently of it). */
export function setReportByline(db: Db, reportId: string, bylineRemoved: boolean): void {
  db.update(report).set({ bylineRemoved }).where(eq(report.id, reportId)).run();
}

/** A Claim's HumanConfirmations, reached only through operator EvidenceLinks
 *  (AD-17, AD-18), keyed to the ProofRequirement. */
export function listHumanConfirmationsForClaim(db: Db, claimId: string) {
  return db
    .select({
      proofRequirementId: humanConfirmation.proofRequirementId,
      evidenceLinkId: humanConfirmation.evidenceLinkId,
      confirmedBy: humanConfirmation.confirmedBy,
      confirmedAt: humanConfirmation.confirmedAt,
      machineOrHuman: humanConfirmation.machineOrHuman,
    })
    .from(humanConfirmation)
    .innerJoin(evidenceLink, eq(humanConfirmation.evidenceLinkId, evidenceLink.id))
    .innerJoin(proofRequirement, eq(humanConfirmation.proofRequirementId, proofRequirement.id))
    .innerJoin(deliverable, eq(proofRequirement.deliverableId, deliverable.id))
    .innerJoin(claim, eq(claim.deliverableId, deliverable.id))
    .where(and(eq(claim.id, claimId), eq(evidenceLink.source, "operator")))
    .all();
}

// --- HumanOverride read (the effective-status resolver's overlay, AD-6) ----

/** The 0..1 HumanOverride for a Claim; its `final_status` overlays the machine
 *  verdict in the effective-status resolver (AD-6). */
export function getHumanOverride(db: Db, claimId: string) {
  return db.select().from(humanOverride).where(eq(humanOverride.claimId, claimId)).get();
}

export interface NewHumanOverride {
  claimId: string;
  finalStatus: ProofStatus;
  authoredBy: string;
  /** Normally omitted; a disagreeing value triggers MixedOriginError (AD-9). */
  dataOrigin?: DataOrigin;
}

/** Set the operator's HumanOverride for a Claim (0..1 per Claim — the table's
 *  `claim_id` is unique). Upserts so an operator can change the override status
 *  after setting it once; without this the second call would violate the unique
 *  constraint. The Story-1.9 UI (switch + caveat gating) builds on this; the
 *  resolver already reads it today (AD-6). `data_origin` is inherited at the
 *  single site (AD-9). */
export function createHumanOverride(db: Db, values: NewHumanOverride) {
  const campaignId = campaignIdOfClaim(db, values.claimId);
  const dataOrigin = inheritDataOrigin(db, campaignId, values.dataOrigin);
  db.delete(humanOverride).where(eq(humanOverride.claimId, values.claimId)).run();
  return db
    .insert(humanOverride)
    .values({
      claimId: values.claimId,
      finalStatus: values.finalStatus,
      authoredBy: values.authoredBy,
      dataOrigin,
    })
    .returning()
    .get();
}

/** Clear the operator's HumanOverride for a Claim — the "Operator override"
 *  toggle's OFF path (Story 1.9). Idempotent (deleting when none is set is a
 *  no-op). Removing the overlay returns the effective status to the pure machine
 *  verdict; it NEVER writes an AuditResult — override is an overlay, not a
 *  recompute (AD-6). */
export function deleteHumanOverride(db: Db, claimId: string): void {
  db.delete(humanOverride).where(eq(humanOverride.claimId, claimId)).run();
}

// --- AuditResult cache read / upsert (AD-4) --------------------------------
//     One row per Claim: the current machine verdict + verbatim trace + the
//     identity tuple. The effective-status resolver recomputes-and-persists
//     here before reading when the tuple is stale (AD-6).

/** The cached AuditResult for a Claim, if any. */
export function readAuditResult(db: Db, claimId: string) {
  return db.select().from(auditResult).where(eq(auditResult.claimId, claimId)).get();
}

export interface UpsertAuditResult {
  claimId: string;
  machineVerdict: ProofStatus;
  trace: TraceEntry[];
  snapshotVersion: number;
  rulesetVersion: string;
  campaignOverrideHash: string;
  evidenceSnapshotHash: string;
}

/** Replace the Claim's cached AuditResult (delete-then-insert keeps exactly one
 *  cache row per Claim). `data_origin` is inherited at the single site (AD-9). */
export function upsertAuditResult(db: Db, values: UpsertAuditResult) {
  const campaignId = campaignIdOfClaim(db, values.claimId);
  const dataOrigin = inheritDataOrigin(db, campaignId);
  db.delete(auditResult).where(eq(auditResult.claimId, values.claimId)).run();
  return db
    .insert(auditResult)
    .values({
      claimId: values.claimId,
      machineVerdict: values.machineVerdict,
      trace: values.trace,
      snapshotVersion: values.snapshotVersion,
      rulesetVersion: values.rulesetVersion,
      campaignOverrideHash: values.campaignOverrideHash,
      evidenceSnapshotHash: values.evidenceSnapshotHash,
      dataOrigin,
    })
    .returning()
    .get();
}

// --- Claim Card drawer reads (Story 1.8) -----------------------------------
//     Read-only detail for the right-side Claim Card. Kept SEPARATE from
//     `listOperatorEvidenceForClaim` (whose exact projection the snapshot
//     assembler hashes — AD-4) so the drawer can surface the extra EvidenceItem
//     columns (type / provenance / uploaded_at) without perturbing the audit
//     cache identity. Still `source = operator` only (AD-17).

/** The Claim's Deliverable header (creator + type) for the drawer title.
 *  `undefined` when the Claim does not exist. */
export function getClaimHeader(db: Db, claimId: string) {
  return db
    .select({
      claimId: claim.id,
      deliverableId: deliverable.id,
      creatorName: creator.name,
      deliverableType: deliverable.type,
    })
    .from(claim)
    .innerJoin(deliverable, eq(claim.deliverableId, deliverable.id))
    .innerJoin(creator, eq(deliverable.creatorId, creator.id))
    .where(eq(claim.id, claimId))
    .get();
}

/** A Claim's `source = operator` EvidenceLinks joined to their EvidenceItem's
 *  display columns (type, first-class provenance, uploaded_at, liveness). The
 *  drawer read: richer than the assembler's `listOperatorEvidenceForClaim`, but
 *  still operator-only so `suggested` links / MatchSuggestions never surface
 *  (AD-17). Ordered by link id for a stable render. */
export function listClaimEvidenceDetail(db: Db, claimId: string) {
  return db
    .select({
      proofRequirementId: evidenceLink.proofRequirementId,
      evidenceLinkId: evidenceLink.id,
      evidenceItemId: evidenceItem.id,
      evidenceType: evidenceItem.type,
      machineOrHuman: evidenceItem.machineOrHuman,
      uploadedAt: evidenceItem.uploadedAt,
      livenessLabel: evidenceItem.livenessLabel,
      // Renderable evidence content for the Client-Safe Report appendix (Story
      // 4.3). Faithful passthrough — the document reproduces these verbatim and
      // never re-derives provenance from them (AD-3/AD-19).
      url: evidenceItem.url,
      note: evidenceItem.note,
      storageKey: evidenceItem.storageKey,
      contentType: evidenceItem.contentType,
      originalFilename: evidenceItem.originalFilename,
      // The evidence row's own `data_origin`, inherited at the single derivation
      // site (AD-9) — a faithful per-row column for the export manifest (Story
      // 4.4). Read verbatim; never back-computed from the campaign at emit time.
      dataOrigin: evidenceItem.dataOrigin,
    })
    .from(evidenceLink)
    .innerJoin(evidenceItem, eq(evidenceLink.evidenceItemId, evidenceItem.id))
    .innerJoin(proofRequirement, eq(evidenceLink.proofRequirementId, proofRequirement.id))
    .innerJoin(deliverable, eq(proofRequirement.deliverableId, deliverable.id))
    .innerJoin(claim, eq(claim.deliverableId, deliverable.id))
    .where(and(eq(claim.id, claimId), eq(evidenceLink.source, "operator")))
    .orderBy(asc(evidenceLink.id))
    .all();
}
