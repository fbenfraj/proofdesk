// Repository operations + the write-time honesty guards (AD-9, AD-18). This is
// the imperative shell: it may read the clock (AD-11) and touch the driver via
// the `Db` handle. The single `data_origin` derivation site lives here
// (`inheritDataOrigin`) so origin is never back-computed in the export layer.
//
// Only the operations exercised by Story 1.3's seam/ownership tests are exposed;
// later stories add operations as they need them (AD-10). Notably, there is NO
// update/delete path for `human_confirmation` — it is append-only by
// construction (AD-18).

import { and, asc, eq } from "drizzle-orm";
import {
  auditResult,
  campaign,
  caveat,
  claim,
  creator,
  type DataOrigin,
  deliverable,
  type EvidenceLinkSource,
  evidenceItem,
  evidenceLink,
  humanConfirmation,
  humanOverride,
  type LivenessLabel,
  type MachineOrHuman,
  matchSuggestion,
  type ProofStatus,
  proofRequirement,
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

export function createCreator(db: Db, campaignId: string, name: string) {
  return db.insert(creator).values({ campaignId, name }).returning().get();
}

export function createDeliverable(
  db: Db,
  values: { campaignId: string; creatorId: string; type: string; claimedStatus: string },
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
  values: { deliverableId: string; kind: string; criticality: "critical" | "supporting" },
) {
  return db.insert(proofRequirement).values(values).returning().get();
}

// --- Exportable children (data_origin inherited via the single site) ------

export interface NewEvidenceItem {
  campaignId: string;
  type: string;
  machineOrHuman: MachineOrHuman;
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
      campaignId: values.campaignId,
      type: values.type,
      machineOrHuman: values.machineOrHuman,
      uploadedAt: values.uploadedAt ?? new Date().toISOString(),
      clientCapturedAt: values.clientCapturedAt,
      livenessLabel: values.livenessLabel,
      dataOrigin,
    })
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

// --- Campaign-scoped list reads (used by the seed test to sweep honesty
//     columns, and by the Story-1.5 snapshot assembler) ---------------------

/** All EvidenceItems in a Campaign. */
export function listEvidenceItems(db: Db, campaignId: string) {
  return db.select().from(evidenceItem).where(eq(evidenceItem.campaignId, campaignId)).all();
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

// --- Claim-scoped reads for the Story-1.5 snapshot assembler (AD-16) -------
//     One assembler is the SOLE producer of AuditSnapshot; these reads give it
//     exactly a Claim's requirements, its operator-only evidence (AD-17), and
//     its human confirmations (AD-18) — no more.

/** The ProofRequirements of a Claim (via its Deliverable). */
export function listProofRequirementsForClaim(db: Db, claimId: string) {
  return db
    .select({
      id: proofRequirement.id,
      kind: proofRequirement.kind,
      criticality: proofRequirement.criticality,
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
