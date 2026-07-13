// src/services/report — the report assembler (AD-20/AD-21). Assembles a
// Client-Safe Report against ONE frozen campaign-wide evidence snapshot, and the
// operator's builder view over it. Two responsibilities, mirroring the board's
// write-vs-read split (src/services/board.ts):
//
//   1. `createReport` — the WRITE path (an explicit operator action, like "Run
//      Proof Audit"): recompute-and-persist every Claim's verdict at the freeze
//      instant, pin the campaign-wide `evidence_snapshot_hash`, mint the next
//      version, and lay down one ReportItem per Claim.
//   2. `getReportBuilderView` — READ-ONLY: resolves each item's inclusion through
//      the ONE pure resolver over the LIVE effective status (AD-6/AD-21), splits
//      client-visible from the internal-only Red follow-up section, and flags the
//      report STALE when the live campaign hash no longer matches the frozen one.
//
// Nothing status-shaped is ever stored on the report (Epic-3 retro AI-3): a
// frozen Green is a shape that cannot exist, so no one can ship one. Staleness is
// `live campaign hash !== frozen hash` — recompute-or-refuse, never silent green.

import { resolveReportInclusion } from "@/src/export";
import {
  type Db,
  getClaimHeader,
  getHumanOverride,
  getLatestReport,
  getReport,
  getReportItem,
  createReport as insertReport,
  createReportItem as insertReportItem,
  listCampaignBoardRows,
  listCaveatsForClaim,
  listClaimEvidenceDetail,
  listReportItems,
  maxReportVersion,
  setReportByline as setReportBylineRow,
  setReportItemInclusion as setReportItemInclusionRow,
} from "@/src/repositories";
import {
  canonicalizeCampaignOverride,
  RULESET_VERSION,
  resolveCampaignRulesetOverrides,
} from "@/src/ruleset";
import {
  type DataOrigin,
  type LivenessLabel,
  type MachineOrHuman,
  type ProofStatus,
  type ReportInclusion,
  type ReportInclusionOverride,
  type ReportItemAudience,
  SNAPSHOT_VERSION,
} from "@/src/schema";
import { assembleSnapshot, readEffectiveStatus, resolveEffectiveStatus } from "./audit";
import { hashObject } from "./hash";

/** A Red claim can enter the client report ONLY with recorded human
 *  responsibility — an explicit inclusion override carrying ≥1 Caveat AND an
 *  attribution (AD-21). The service refuses otherwise (sibling of the repository
 *  guard errors like MixedOriginError). */
export class RedInclusionWithoutCaveatError extends Error {}

// --- The campaign-wide frozen hash (AD-20) ---------------------------------

/** `assembleSnapshot` needs a `now`, but only `snapshot.claim` is hashed (never
 *  `snapshot.now`), so the campaign hash is `now`-independent and comparable
 *  across time — the staleness tripwire. A fixed sentinel makes that explicit and
 *  keeps this function clock-free (AD-11-friendly for the read path). */
const HASH_SENTINEL_NOW = "1970-01-01T00:00:00.000Z";

/**
 * The campaign-wide freeze fingerprint pinned into `report.evidence_snapshot_hash`
 * (AD-20). It hashes EVERY determinant of each Claim's EFFECTIVE Proof Status —
 * not just its evidence — so that ANY post-freeze change that could move a verdict
 * trips staleness. The report is derived-never-materialized (AD-6/AD-21), so the
 * only faithful way to keep it "a single point in time by construction" is to
 * fingerprint the whole determinant set:
 *
 *   - the per-Claim evidence snapshot (`hashObject(snapshot.claim)` — the SAME
 *     value the AuditResult cache identity uses, AD-4),
 *   - the ruleset identity (`RULESET_VERSION` + the campaign's ruleset-override
 *     hash) — the other operands of the machine verdict (AD-4),
 *   - the Claim's HumanOverride `final_status` — because effective status is
 *     `override.final_status ?? machine_verdict` (AD-6), so an override added,
 *     changed, or cleared after the freeze changes the client/internal split and
 *     MUST show as stale (it does not touch the evidence snapshot on its own).
 *
 * Reuses the sole snapshot assembler (AD-16) and the one canonical `hashObject`.
 * READ-ONLY: it never writes. `now` is excluded (the snapshot hashes only
 * `snapshot.claim`), so the fingerprint is comparable across time.
 */
export function computeCampaignEvidenceSnapshotHash(db: Db, campaignId: string): string {
  // Per-campaign ruleset-override hash — computed once, shared by every Claim.
  const campaignOverrideHash = hashObject(
    canonicalizeCampaignOverride(resolveCampaignRulesetOverrides(campaignId)),
  );
  const perClaim = listCampaignBoardRows(db, campaignId)
    .map((row) => {
      const override = getHumanOverride(db, row.claimId);
      return {
        claimId: row.claimId,
        snapshotVersion: SNAPSHOT_VERSION,
        rulesetVersion: RULESET_VERSION,
        campaignOverrideHash,
        evidenceSnapshotHash: hashObject(
          assembleSnapshot(db, row.claimId, HASH_SENTINEL_NOW).claim,
        ),
        // Only `final_status` moves the verdict/inclusion (AD-6); attribution does not.
        overrideFinalStatus: override?.finalStatus ?? null,
      };
    })
    .sort((a, b) => a.claimId.localeCompare(b.claimId));
  return hashObject(perClaim);
}

// --- Builder view model ----------------------------------------------------

export interface ReportItemView {
  reportItemId: string;
  claimId: string;
  creatorName: string;
  deliverableType: string;
  /** The LIVE effective Proof Status, read through the ONE resolver (AD-6). */
  effectiveStatus: ProofStatus;
  /** `inclusion_override ?? default_from_status(effectiveStatus)` (AD-21). */
  inclusion: ReportInclusion;
  /** Derived from `inclusion`, never stored (AD-21). */
  audience: ReportItemAudience;
  inclusionOverride: ReportInclusionOverride | null;
  overriddenBy: string | null;
  /** A client-visible non-Green item with no operator Caveat is NOT yet
   *  client-includable (AD-6). Surfaced so the builder can block it. */
  requiresCaveat: boolean;
  /** The Claim's operator-authored Caveat text(s), verbatim (Story 4.3). A
   *  client-visible Caveated (effective-Yellow) Claim always carries ≥1 — the
   *  document renders the caveat with the claim, never a Caveated claim bare. */
  caveats: string[];
}

/** One receipt in the Proof Appendix (Story 4.2, FR-13). A receipt is an operator
 *  EvidenceLink's EvidenceItem, carrying its FIRST-CLASS provenance verbatim — the
 *  appendix never re-derives machine-vs-human at render time (AD-3). A metric /
 *  screenshot figure is therefore ALWAYS a Human assertion (AD-19). */
export interface AppendixReceipt {
  proofRequirementId: string;
  /** The EvidenceItem's operator-entered type label (user data, not localized). */
  evidenceType: string;
  /** Machine-checked fact vs Human assertion — read faithfully from the column. */
  provenance: MachineOrHuman;
  /** Present for link receipts that were liveness-checked (AD-5); null otherwise. */
  livenessLabel: LivenessLabel | null;
  /** Server-authoritative UTC ISO-8601 `uploaded_at` (AD-11) — a mono timestamp. */
  timestamp: string;
  /** Renderable evidence content, reproduced verbatim for the document (Story
   *  4.3). A receipt is a link (`url`), a screenshot/file (`storageKey` +
   *  `contentType`, base64-inlined by the shell), or a text note (`note`) — the
   *  shell picks the render shape; the service never re-derives provenance from
   *  these (AD-3/AD-19). */
  url: string | null;
  note: string | null;
  storageKey: string | null;
  contentType: string | null;
  originalFilename: string | null;
  /** The evidence row's `data_origin` (`seeded | real`), inherited at the single
   *  derivation site (AD-9). A faithful per-row column for the export manifest
   *  (Story 4.4) — read verbatim, never back-computed in the export layer. */
  dataOrigin: DataOrigin;
}

/** The Proof Appendix entry for ONE included Claim (Story 4.2, FR-13). */
export interface AppendixEntry {
  claimId: string;
  creatorName: string;
  deliverableType: string;
  /** The Claim's receipts, each labelled machine/human (order matches the drawer's
   *  stable link-id order). */
  receipts: AppendixReceipt[];
  /** FR-13: every included Claim must carry ≥1 linked receipt. When zero, this is
   *  SURFACED (never hidden, never a fabricated receipt) so the operator resolves
   *  it — the honest analogue of Story 4.1's `requiresCaveat`. */
  missingReceipt: boolean;
}

export interface ReportBuilderView {
  reportId: string;
  campaignId: string;
  version: number;
  createdAt: string;
  /** Frozen at creation (AD-20). */
  evidenceSnapshotHash: string;
  /** Operator removed the ProofDesk audit byline for this version (FR-12). The
   *  shell composes the localized byline from this flag; the appendix is assembled
   *  independently of it (AC4 — provenance travels with the receipts, not the
   *  byline). */
  bylineRemoved: boolean;
  /** live campaign hash !== frozen hash → evidence changed since the freeze; the
   *  operator must regenerate. The view never presents a stale verdict as current
   *  (AC5 / retro AI-3). */
  stale: boolean;
  /** Included / included-with-caveat items shown to the client. */
  clientVisible: ReportItemView[];
  /** The internal-only follow-up section — every excluded-from-client (Red) item.
   *  Visible to the operator, never dropped, never shipped to the client (AD-21). */
  internalOnly: ReportItemView[];
  /** The Proof Appendix — per client-visible Claim, its receipts labelled
   *  machine/human (FR-13). ALWAYS present regardless of `bylineRemoved`; empty
   *  when the report is stale (the split is withheld — AC5/AI-3). */
  appendix: AppendixEntry[];
}

/** Assemble one Claim's Proof Appendix entry (Story 4.2, FR-13). Receipts are the
 *  operator EvidenceLinks joined to their EvidenceItem provenance/liveness/
 *  timestamp (`listClaimEvidenceDetail` — `source = operator` only, AD-17). It
 *  reads NOTHING about the byline: provenance travels with the receipts, not the
 *  byline (AC4). Provenance is reproduced verbatim from `machine_or_human` — no
 *  render-time relabelling (AD-3/AD-19). */
function buildAppendixEntry(db: Db, item: ReportItemView): AppendixEntry {
  const receipts: AppendixReceipt[] = listClaimEvidenceDetail(db, item.claimId).map((e) => ({
    proofRequirementId: e.proofRequirementId,
    evidenceType: e.evidenceType,
    provenance: e.machineOrHuman,
    livenessLabel: e.livenessLabel,
    timestamp: e.uploadedAt,
    url: e.url,
    note: e.note,
    storageKey: e.storageKey,
    contentType: e.contentType,
    originalFilename: e.originalFilename,
    dataOrigin: e.dataOrigin,
  }));
  return {
    claimId: item.claimId,
    creatorName: item.creatorName,
    deliverableType: item.deliverableType,
    receipts,
    missingReceipt: receipts.length === 0,
  };
}

/** Resolve one ReportItem into its view: LIVE status → pure inclusion → derived
 *  audience → caveat-readiness. `readEffectiveStatus` is READ-ONLY (no recompute,
 *  no write) — mirrors the board. A report item always references a Claim that was
 *  audited at report creation, so a null result is an invariant violation. */
function toItemView(
  db: Db,
  item: {
    id: string;
    claimId: string;
    inclusionOverride: ReportInclusionOverride | null;
    overriddenBy: string | null;
  },
): ReportItemView {
  const effective = readEffectiveStatus(db, item.claimId);
  if (!effective) {
    throw new Error(
      `Report item ${item.id} references un-audited Claim ${item.claimId} - a Report is only assembled over audited Claims (AD-20).`,
    );
  }
  const header = getClaimHeader(db, item.claimId);
  const { inclusion, audience } = resolveReportInclusion(
    effective.effectiveStatus,
    item.inclusionOverride,
  );
  // Read the Claim's Caveats once — both the includability gate and the document
  // render need them (a Caveated client-visible Claim always shows its caveat).
  const caveats = listCaveatsForClaim(db, item.claimId).map((c) => c.text);
  const requiresCaveat =
    audience === "client_visible" && effective.effectiveStatus !== "green" && caveats.length === 0;
  return {
    reportItemId: item.id,
    claimId: item.claimId,
    creatorName: header?.creatorName ?? "",
    deliverableType: header?.deliverableType ?? "",
    effectiveStatus: effective.effectiveStatus,
    inclusion,
    audience,
    inclusionOverride: item.inclusionOverride,
    overriddenBy: item.overriddenBy,
    requiresCaveat,
    caveats,
  };
}

/** Assemble the operator's builder view over a frozen Report (READ-ONLY). Splits
 *  client-visible from the internal-only Red follow-up section, and flags the
 *  whole view stale when the live campaign hash diverges from the frozen one. */
export function getReportBuilderView(db: Db, reportId: string): ReportBuilderView | null {
  const rep = getReport(db, reportId);
  if (!rep) return null;
  const liveHash = computeCampaignEvidenceSnapshotHash(db, rep.campaignId);
  const stale = liveHash !== rep.evidenceSnapshotHash;
  // REFUSE the split when stale (AC5 / retro AI-3: "recompute-or-refuse, never
  // silent green"). A frozen Report stores only a hash, so once evidence changes
  // its point-in-time verdicts are unreconstructable — the persisted verdicts are
  // the OLD ones and a now-Red Claim could otherwise sit under `clientVisible`.
  // Rather than hand a caller a stale client-safe split to render/export, we
  // withhold it entirely and signal `stale`; the operator regenerates (a new
  // version freezes the current evidence). The split is only ever exposed for a
  // report that still matches live evidence.
  const views = stale ? [] : listReportItems(db, reportId).map((item) => toItemView(db, item));
  const clientVisible = views.filter((v) => v.audience === "client_visible");
  return {
    reportId: rep.id,
    campaignId: rep.campaignId,
    version: rep.version,
    createdAt: rep.createdAt,
    evidenceSnapshotHash: rep.evidenceSnapshotHash,
    bylineRemoved: rep.bylineRemoved,
    stale,
    clientVisible,
    internalOnly: views.filter((v) => v.audience === "internal_only"),
    // The Proof Appendix lists per client-visible Claim its receipts (FR-13). It
    // is derived from `clientVisible` (so it is empty when stale, exactly like the
    // split) and NEVER reads `bylineRemoved` — the appendix always travels (AC4).
    appendix: clientVisible.map((v) => buildAppendixEntry(db, v)),
  };
}

/** The latest Report's builder view for a Campaign, or null when none exists yet. */
export function getLatestReportBuilderView(db: Db, campaignId: string): ReportBuilderView | null {
  const latest = getLatestReport(db, campaignId);
  return latest ? getReportBuilderView(db, latest.id) : null;
}

// --- The WRITE path: create a new frozen version (AD-20) --------------------

/** Insert the Report row at `maxReportVersion + 1`, self-healing a lost race on
 *  the `(campaign_id, version)` unique index by recomputing the next version and
 *  retrying (never a 500 on a double-submit). The synchronous better-sqlite3
 *  driver already serializes read+insert within this single process (no `await`
 *  between them, so the event loop can't interleave), making a collision
 *  effectively impossible today — but this keeps allocation correct-by-retry for
 *  the EU-sovereign Postgres v2 seam (AD-10/AD-15) where true concurrency exists. */
function insertNextReportVersion(
  db: Db,
  campaignId: string,
  evidenceSnapshotHash: string,
  createdAt: string,
) {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt++) {
    const version = maxReportVersion(db, campaignId) + 1;
    try {
      return insertReport(db, { campaignId, version, evidenceSnapshotHash, createdAt });
    } catch (err) {
      const raced = err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
      if (raced && attempt < MAX_ATTEMPTS) continue;
      throw err;
    }
  }
}

/**
 * Create a new Report version for a Campaign — the explicit operator action.
 *
 *   1. Drive the ONE resolver over every Claim (recompute-and-persist, AD-6) so
 *      the frozen verdicts are fresh at this instant.
 *   2. Pin the campaign-wide `evidence_snapshot_hash` (AD-20).
 *   3. version = maxReportVersion + 1 — new evidence produces a NEW version,
 *      never a mutation of an in-flight one (AC1); allocation self-heals a
 *      unique-index race (`insertNextReportVersion`).
 *   4. Lay down one ReportItem per Claim (override null = follow the default).
 *
 * @param now server-UTC ISO-8601 generated at the shell boundary (AD-11).
 */
export function createReport(db: Db, campaignId: string, now: string): ReportBuilderView {
  const rows = listCampaignBoardRows(db, campaignId);
  for (const row of rows) {
    // Recompute-and-persist each Claim's machine verdict when stale (AD-4/AD-6).
    resolveEffectiveStatus(db, row.claimId, now);
  }
  const evidenceSnapshotHash = computeCampaignEvidenceSnapshotHash(db, campaignId);
  const rep = insertNextReportVersion(db, campaignId, evidenceSnapshotHash, now);
  for (const row of rows) {
    insertReportItem(db, { reportId: rep.id, claimId: row.claimId });
  }
  const view = getReportBuilderView(db, rep.id);
  if (!view) throw new Error(`Report ${rep.id} vanished immediately after creation`);
  return view;
}

// --- Operator inclusion override (AD-21, the Red-include gate) --------------

export interface SetReportItemInclusionInput {
  /** The Report the item must belong to — the URL's parent scope. A mismatch is
   *  treated as not-found, so a stale/forged URL can never mutate another
   *  report's item or leak its builder view. */
  reportId: string;
  reportItemId: string;
  /** `null` clears the override back to the status default. */
  override: ReportInclusionOverride | null;
  /** Shell-resolved operator identity (never client-supplied) — recorded
   *  responsibility. Required to include a Red claim. */
  overriddenBy: string;
}

/**
 * Set (or clear) a ReportItem's operator inclusion override, then return the
 * refreshed builder view. Enforces the Red-claim rule (AD-21): including a Claim
 * whose LIVE effective status is Red requires ≥1 operator-authored Caveat AND an
 * attribution — else `RedInclusionWithoutCaveatError`. Recorded human
 * responsibility, never a silent client-ship of a Red claim.
 *
 * Returns null when the ReportItem does not exist OR does not belong to
 * `input.reportId` (→ the route returns 404) — the item is always scoped to its
 * URL's parent Report.
 */
export function setReportItemInclusion(
  db: Db,
  input: SetReportItemInclusionInput,
): ReportBuilderView | null {
  const item = getReportItem(db, input.reportItemId);
  if (!item || item.reportId !== input.reportId) return null;

  if (input.override === "included") {
    const effective = readEffectiveStatus(db, item.claimId);
    if (effective?.effectiveStatus === "red") {
      const hasCaveat = listCaveatsForClaim(db, item.claimId).length > 0;
      if (!hasCaveat || input.overriddenBy.trim() === "") {
        throw new RedInclusionWithoutCaveatError(
          `Including a Red Claim in the client report requires a recorded Caveat and attribution (AD-21).`,
        );
      }
    }
  }

  setReportItemInclusionRow(
    db,
    input.reportItemId,
    input.override,
    input.override === null ? null : input.overriddenBy,
  );
  return getReportBuilderView(db, item.reportId);
}

// --- Operator branding: remove/restore the ProofDesk audit byline (FR-12) ---

/**
 * Set (or clear) a Report's ProofDesk-byline removal flag, then return the
 * refreshed builder view (Story 4.2, FR-12). Presentation-only intent — it never
 * touches status or the appendix. The byline is present by default and
 * operator-removable; the Proof Appendix travels regardless (AC4).
 *
 * Returns null when the Report does not exist (→ the route returns 404).
 */
export function setReportByline(
  db: Db,
  reportId: string,
  bylineRemoved: boolean,
): ReportBuilderView | null {
  if (!getReport(db, reportId)) return null;
  setReportBylineRow(db, reportId, bylineRemoved);
  return getReportBuilderView(db, reportId);
}
