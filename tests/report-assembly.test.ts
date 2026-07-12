// Story 4.1 — report assembly against a frozen snapshot + the inclusion resolver
// through the REAL audit (AD-20/AD-21). These are the invariants the pure-resolver
// and schema unit tests can't see because they need real verdicts:
//   AC1 — a Report pins ONE campaign-wide frozen hash; new evidence → a NEW
//         version, never a mutation of an in-flight one.
//   AC3 — Red is internal-only by default, never dropped from the operator's view,
//         and includable ONLY with a recorded Caveat + attribution.
//   AC4 — an operator override survives a later status change; a non-overridden
//         item's inclusion is re-derived (never stale).
//   AC5 — [Epic-3 retro AI-3] a stale verdict is structurally unrepresentable:
//         no verdict column exists, and evidence mutation flips the report `stale`.

import { getTableColumns } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { SEED_DEMO_CAMPAIGN_ID, seedDemoCampaign } from "@/seed/demo-campaign";
import {
  appendHumanConfirmation,
  createCampaign,
  createCaveat,
  createClaim,
  createClient,
  createCreator,
  createDeliverable,
  createEvidenceItem,
  createEvidenceLink,
  createHumanOverride,
  createProofRequirement,
  createTestDb,
  type Db,
  type DbHandle,
  getReport,
  getReportItem,
  maxReportVersion,
} from "@/src/repositories";
import {
  PROOF_STATUS,
  REPORT_INCLUSION,
  REPORT_ITEM_AUDIENCE,
  report,
  reportItem,
} from "@/src/schema";
import {
  createReport,
  getReportBuilderView,
  RedInclusionWithoutCaveatError,
  resolveEffectiveStatus,
  setReportItemInclusion,
} from "@/src/services";

const NOW = "2026-07-12T00:00:00.000Z";
const LATER = "2026-07-12T01:00:00.000Z";

let handle: DbHandle;
let db: Db;

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
});

// --- builders: real claims with controllable verdicts ----------------------

function makeCampaign(dataOrigin: "seeded" | "real" = "real") {
  const client = createClient(db, "Acme");
  const campaign = createCampaign(db, {
    clientId: client.id,
    name: "Real",
    dataOrigin,
    isDemo: dataOrigin === "seeded",
  });
  const creator = createCreator(db, campaign.id, "Nova", "nova");
  return { campaignId: campaign.id, creatorId: creator.id };
}

/** A Green claim: critical proof-of-posting, a `live` link WITH a confirmation. */
function addGreenClaim(campaignId: string, creatorId: string) {
  const deliverable = createDeliverable(db, {
    campaignId,
    creatorId,
    type: "Twitch sponsor segment",
    claimedStatus: "delivered",
  });
  const claim = createClaim(db, deliverable.id);
  const req = createProofRequirement(db, {
    deliverableId: deliverable.id,
    kind: "proof-of-posting",
    criticality: "critical",
  });
  const item = createEvidenceItem(db, {
    campaignId,
    type: "link",
    machineOrHuman: "machine",
    livenessLabel: "live",
  });
  const link = createEvidenceLink(db, {
    evidenceItemId: item.id,
    proofRequirementId: req.id,
    source: "operator",
  });
  appendHumanConfirmation(db, { evidenceLinkId: link.id, confirmedBy: "op", confirmedAt: NOW });
  return { deliverableId: deliverable.id, claimId: claim.id };
}

/** A Yellow claim: critical proof-of-posting, confirmed but NOT live (caps Yellow). */
function addYellowClaim(campaignId: string, creatorId: string) {
  const deliverable = createDeliverable(db, {
    campaignId,
    creatorId,
    type: "Instagram Reel",
    claimedStatus: "delivered",
  });
  const claim = createClaim(db, deliverable.id);
  const req = createProofRequirement(db, {
    deliverableId: deliverable.id,
    kind: "proof-of-posting",
    criticality: "critical",
  });
  const item = createEvidenceItem(db, { campaignId, type: "link", machineOrHuman: "machine" });
  const link = createEvidenceLink(db, {
    evidenceItemId: item.id,
    proofRequirementId: req.id,
    source: "operator",
  });
  appendHumanConfirmation(db, { evidenceLinkId: link.id, confirmedBy: "op", confirmedAt: NOW });
  return { deliverableId: deliverable.id, claimId: claim.id };
}

/** A Red claim: a critical requirement with NO evidence at all. */
function addRedClaim(campaignId: string, creatorId: string) {
  const deliverable = createDeliverable(db, {
    campaignId,
    creatorId,
    type: "Expired Story",
    claimedStatus: "delivered",
  });
  const claim = createClaim(db, deliverable.id);
  createProofRequirement(db, {
    deliverableId: deliverable.id,
    kind: "proof-of-posting",
    criticality: "critical",
  });
  return { deliverableId: deliverable.id, claimId: claim.id };
}

/** Flip a claim to Red by adding an unmet critical requirement to its Deliverable
 *  — an evidence-shape change that alters the campaign snapshot hash. */
function flipToRed(deliverableId: string) {
  createProofRequirement(db, {
    deliverableId,
    kind: "human-assertion",
    criticality: "critical",
  });
}

// --- AC5: no verdict column can exist (structural gate — retro AI-3) --------

describe("AC5 structural gate — a stored verdict is unrepresentable (retro AI-3)", () => {
  const forbidden = [
    [...PROOF_STATUS].sort(),
    [...REPORT_INCLUSION].sort(),
    [...REPORT_ITEM_AUDIENCE].sort(),
  ].map((a) => JSON.stringify(a));

  // DB column names (snake_case) — getTableColumns is keyed by the camelCase JS
  // property, so read the true column name off each column object.
  function dbColumnNames(table: typeof report | typeof reportItem): string[] {
    return Object.values(getTableColumns(table)).map((c) => c.name);
  }

  function enumSetsOf(table: typeof report | typeof reportItem): string[] {
    return Object.values(getTableColumns(table))
      .map((c) => (c as { enumValues?: readonly string[] }).enumValues)
      .filter((e): e is readonly string[] => Array.isArray(e))
      .map((e) => JSON.stringify([...e].sort()));
  }

  test("report_item has NO `audience` column (removed — it was a stale status-derivative)", () => {
    expect(dbColumnNames(reportItem)).not.toContain("audience");
  });

  test("neither report nor report_item can store a Proof Status / inclusion / audience", () => {
    const present = new Set([...enumSetsOf(report), ...enumSetsOf(reportItem)]);
    for (const f of forbidden) {
      expect(present.has(f)).toBe(false);
    }
  });

  test("negative control — the intended columns DO exist", () => {
    const rep = dbColumnNames(report);
    const ri = dbColumnNames(reportItem);
    expect(rep).toContain("evidence_snapshot_hash");
    expect(rep).toContain("version");
    expect(rep).toContain("created_at");
    // inclusion_override is stored INTENT (included|excluded), NOT a status.
    expect(ri).toContain("inclusion_override");
    expect(ri).toContain("overridden_by");
  });
});

// --- AC1 + AC2: assembly, split, version pinning ----------------------------

describe("createReport — frozen assembly + inclusion split (AC1, AC2)", () => {
  test("splits client-visible (G/Y) from the internal-only Red follow-up", () => {
    const { campaignId, creatorId } = makeCampaign();
    const green = addGreenClaim(campaignId, creatorId);
    const yellow = addYellowClaim(campaignId, creatorId);
    const red = addRedClaim(campaignId, creatorId);

    const view = createReport(db, campaignId, NOW);

    expect(view.stale).toBe(false);
    expect(view.version).toBe(1);
    const clientClaims = view.clientVisible.map((i) => i.claimId).sort();
    expect(clientClaims).toEqual([green.claimId, yellow.claimId].sort());
    expect(view.internalOnly.map((i) => i.claimId)).toEqual([red.claimId]);

    const g = view.clientVisible.find((i) => i.claimId === green.claimId);
    const y = view.clientVisible.find((i) => i.claimId === yellow.claimId);
    expect(g?.inclusion).toBe("included");
    expect(g?.requiresCaveat).toBe(false);
    expect(y?.inclusion).toBe("included-with-caveat");
    // A Yellow with no operator Caveat is not yet client-includable (AD-6).
    expect(y?.requiresCaveat).toBe(true);
    expect(view.internalOnly[0].inclusion).toBe("excluded-from-client");
  });

  test("a second version is minted, not a mutation (AC1)", () => {
    const { campaignId, creatorId } = makeCampaign();
    addGreenClaim(campaignId, creatorId);

    const v1 = createReport(db, campaignId, NOW);
    const v2 = createReport(db, campaignId, LATER);

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(maxReportVersion(db, campaignId)).toBe(2);
    // No evidence changed → identical frozen hash, distinct identity.
    expect(v2.evidenceSnapshotHash).toBe(v1.evidenceSnapshotHash);
    expect(v2.reportId).not.toBe(v1.reportId);
    // The v1 row is untouched by the v2 creation.
    const v1Row = getReport(db, v1.reportId);
    expect(v1Row?.version).toBe(1);
    expect(v1Row?.createdAt).toBe(NOW);
  });
});

// --- AC5: stale-recompute (freeze → mutate → refuse-or-recompute) -----------

describe("AC5 stale-recompute — evidence mutation flips the report stale (retro AI-3)", () => {
  test("a frozen report goes stale on evidence change and never shows the old verdict as current", () => {
    const { campaignId, creatorId } = makeCampaign();
    const green = addGreenClaim(campaignId, creatorId);

    const v1 = createReport(db, campaignId, NOW);
    expect(v1.stale).toBe(false);
    expect(v1.clientVisible.map((i) => i.claimId)).toEqual([green.claimId]);
    const frozenHash = v1.evidenceSnapshotHash;

    // Mutate evidence: the Green claim now carries an unmet critical requirement.
    flipToRed(green.deliverableId);

    // Reading the SAME frozen report: it must flag stale (recompute-or-refuse) —
    // the live campaign hash no longer matches the frozen one. Never a silent Green.
    // The client-safe split is WITHHELD entirely, not served from old verdicts.
    const stale = getReportBuilderView(db, v1.reportId);
    expect(stale?.stale).toBe(true);
    expect(stale?.clientVisible).toEqual([]);
    expect(stale?.internalOnly).toEqual([]);

    // Regenerating recomputes verdicts: a NEW version with a DIFFERENT hash, and
    // the flipped claim is now Red (internal-only). v1 stays byte-for-byte frozen.
    const v2 = createReport(db, campaignId, LATER);
    expect(v2.version).toBe(2);
    expect(v2.evidenceSnapshotHash).not.toBe(frozenHash);
    expect(v2.internalOnly.map((i) => i.claimId)).toEqual([green.claimId]);
    expect(v2.clientVisible).toHaveLength(0);
    const v1Row = getReport(db, v1.reportId);
    expect(v1Row?.evidenceSnapshotHash).toBe(frozenHash);
    expect(v1Row?.version).toBe(1);
  });

  test("a HumanOverride added after freeze also trips stale (effective status is a determinant, AD-6)", () => {
    const { campaignId, creatorId } = makeCampaign();
    const red = addRedClaim(campaignId, creatorId);
    const v1 = createReport(db, campaignId, NOW);
    expect(v1.stale).toBe(false);
    expect(v1.internalOnly.map((i) => i.claimId)).toEqual([red.claimId]);

    // Overriding the Red claim to Green does NOT touch its evidence snapshot, but
    // it DOES change the effective status → the frozen split must not silently move
    // a now-Green claim into the client view; the report goes stale instead.
    createHumanOverride(db, { claimId: red.claimId, finalStatus: "green", authoredBy: "op" });

    const after = getReportBuilderView(db, v1.reportId);
    expect(after?.stale).toBe(true);
    expect(after?.clientVisible).toEqual([]);
    expect(after?.internalOnly).toEqual([]);
  });
});

// --- AC3: the Red-claim rule ------------------------------------------------

describe("AC3 Red-claim rule — internal-only by default, includable only with responsibility", () => {
  test("including a Red claim with NO caveat is refused", () => {
    const { campaignId, creatorId } = makeCampaign();
    const red = addRedClaim(campaignId, creatorId);
    const view = createReport(db, campaignId, NOW);
    const item = view.internalOnly.find((i) => i.claimId === red.claimId);
    expect(item).toBeDefined();

    expect(() =>
      setReportItemInclusion(db, {
        reportId: view.reportId,
        reportItemId: item?.reportItemId ?? "",
        override: "included",
        overriddenBy: "op",
      }),
    ).toThrow(RedInclusionWithoutCaveatError);
  });

  test("including a Red claim with a recorded caveat + attribution succeeds", () => {
    const { campaignId, creatorId } = makeCampaign();
    const red = addRedClaim(campaignId, creatorId);
    const view = createReport(db, campaignId, NOW);
    const item = view.internalOnly.find((i) => i.claimId === red.claimId);

    createCaveat(db, {
      claimId: red.claimId,
      text: "Client accepted late delivery.",
      authoredBy: "op",
    });

    const after = setReportItemInclusion(db, {
      reportId: view.reportId,
      reportItemId: item?.reportItemId ?? "",
      override: "included",
      overriddenBy: "op",
    });
    expect(after?.internalOnly).toHaveLength(0);
    const moved = after?.clientVisible.find((i) => i.claimId === red.claimId);
    expect(moved?.inclusion).toBe("included");
    expect(moved?.inclusionOverride).toBe("included");
    expect(moved?.overriddenBy).toBe("op");
  });

  test("attribution cannot be blank even with a caveat", () => {
    const { campaignId, creatorId } = makeCampaign();
    const red = addRedClaim(campaignId, creatorId);
    const view = createReport(db, campaignId, NOW);
    const item = view.internalOnly.find((i) => i.claimId === red.claimId);
    createCaveat(db, { claimId: red.claimId, text: "note", authoredBy: "op" });

    expect(() =>
      setReportItemInclusion(db, {
        reportId: view.reportId,
        reportItemId: item?.reportItemId ?? "",
        override: "included",
        overriddenBy: "   ",
      }),
    ).toThrow(RedInclusionWithoutCaveatError);
  });

  test("an item is scoped to its report — a mismatched reportId is not-found", () => {
    const { campaignId, creatorId } = makeCampaign();
    addGreenClaim(campaignId, creatorId);
    // Two separate report versions; each has its OWN items.
    const v1 = createReport(db, campaignId, NOW);
    const v2 = createReport(db, campaignId, LATER);
    const v1Item = v1.clientVisible[0];

    // Targeting v1's item under v2's report id must NOT mutate anything.
    const result = setReportItemInclusion(db, {
      reportId: v2.reportId,
      reportItemId: v1Item.reportItemId,
      override: "excluded",
      overriddenBy: "op",
    });
    expect(result).toBeNull();
    expect(getReportItem(db, v1Item.reportItemId)?.inclusionOverride).toBeNull();
  });
});

// --- AC4: override survives status change; default is re-derived ------------

describe("AC4 — override never silently overwritten; default inclusion never stale", () => {
  test("an override diverges from the default and is honored (derived, not materialized)", () => {
    const { campaignId, creatorId } = makeCampaign();
    const a = addGreenClaim(campaignId, creatorId); // will be overridden
    const b = addGreenClaim(campaignId, creatorId); // no override

    const v1 = createReport(db, campaignId, NOW);
    const aItem = v1.clientVisible.find((i) => i.claimId === a.claimId);
    expect(v1.clientVisible.map((i) => i.claimId)).toContain(b.claimId);

    // Exclude A while it is Green. An override write touches only report_item, not
    // evidence — the report stays FRESH (not stale), so the split is still served.
    const after = setReportItemInclusion(db, {
      reportId: v1.reportId,
      reportItemId: aItem?.reportItemId ?? "",
      override: "excluded",
      overriddenBy: "op",
    });
    expect(after?.stale).toBe(false);
    // A: override (excluded) diverges from its Green default (included) and wins.
    expect(after?.internalOnly.map((i) => i.claimId)).toContain(a.claimId);
    // B: no override → default from LIVE status (included) — derived, not stored.
    expect(after?.clientVisible.map((i) => i.claimId)).toContain(b.claimId);
  });

  test("a later status change never silently overwrites a stored override", () => {
    const { campaignId, creatorId } = makeCampaign();
    const a = addGreenClaim(campaignId, creatorId);
    const v1 = createReport(db, campaignId, NOW);
    const aItem = v1.clientVisible.find((i) => i.claimId === a.claimId);

    setReportItemInclusion(db, {
      reportId: v1.reportId,
      reportItemId: aItem?.reportItemId ?? "",
      override: "excluded",
      overriddenBy: "op",
    });
    expect(getReportItem(db, aItem?.reportItemId ?? "")?.inclusionOverride).toBe("excluded");

    // Flip A's status and re-audit. The stored override is untouched by the status
    // change, and the now-stale report withholds its split (recompute-or-refuse).
    flipToRed(a.deliverableId);
    resolveEffectiveStatus(db, a.claimId, LATER);
    expect(getReportItem(db, aItem?.reportItemId ?? "")?.inclusionOverride).toBe("excluded");
    expect(getReportBuilderView(db, v1.reportId)?.stale).toBe(true);
  });

  test("a regenerated version re-derives inclusion from the new status (no stale inclusion)", () => {
    const { campaignId, creatorId } = makeCampaign();
    const b = addGreenClaim(campaignId, creatorId);
    const v1 = createReport(db, campaignId, NOW);
    expect(v1.clientVisible.map((i) => i.claimId)).toContain(b.claimId);

    flipToRed(b.deliverableId);
    const v2 = createReport(db, campaignId, LATER);
    // The fresh version reflects the NEW Red status — inclusion is always derived,
    // so there is no materialized inclusion left to go stale.
    expect(v2.internalOnly.map((i) => i.claimId)).toContain(b.claimId);
    expect(v2.clientVisible.map((i) => i.claimId)).not.toContain(b.claimId);
  });
});

// --- data_origin inheritance (AD-9 hard-wall root for Story 4.4) -------------

describe("data_origin inheritance — the export hard-wall root (AD-9)", () => {
  test("a seeded campaign's report + items carry data_origin 'seeded'", () => {
    seedDemoCampaign(db);
    const view = createReport(db, SEED_DEMO_CAMPAIGN_ID, NOW);
    const repRow = getReport(db, view.reportId);
    expect(repRow?.dataOrigin).toBe("seeded");
    const anItem = [...view.clientVisible, ...view.internalOnly][0];
    expect(getReportItem(db, anItem.reportItemId)?.dataOrigin).toBe("seeded");
  });
});
