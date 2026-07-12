// Story 4.2 — the Proof Appendix + agency-branding byline on the frozen-report
// builder view (FR-12, FR-13, AD-3/AD-19). These assert the invariants that make
// the appendix honest:
//   AC3 — per client-visible Claim, receipts carry faithful machine/human
//         provenance, liveness, and a server timestamp; Red claims are absent.
//   AC4 — the appendix travels regardless of the byline; ≥1 receipt per included
//         Claim, and a zero-receipt included Claim is SURFACED (missingReceipt).
//   AC5 — a metric receipt is ALWAYS a Human assertion (AD-19) — never relabelled.
//   AC6 — a stale report withholds the appendix exactly like the split (AI-3).
//   AC2 — the byline is present by default and per-version operator-removable.

import { getTableColumns } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
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
  createProofRequirement,
  createTestDb,
  type Db,
  type DbHandle,
  getReport,
} from "@/src/repositories";
import { report } from "@/src/schema";
import { createReport, getReportBuilderView, setReportByline } from "@/src/services";

const NOW = "2026-07-12T00:00:00.000Z";
const LATER = "2026-07-12T01:00:00.000Z";

let handle: DbHandle;
let db: Db;

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
});

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

/** A Green claim (critical proof-of-posting, live + confirmed link). Returns the
 *  proof-requirement id so extra receipts can be attached to the SAME requirement
 *  without perturbing the verdict. */
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
    intakeKind: "url",
    livenessLabel: "live",
    uploadedAt: NOW,
  });
  const link = createEvidenceLink(db, {
    evidenceItemId: item.id,
    proofRequirementId: req.id,
    source: "operator",
  });
  appendHumanConfirmation(db, { evidenceLinkId: link.id, confirmedBy: "op", confirmedAt: NOW });
  return { deliverableId: deliverable.id, claimId: claim.id, requirementId: req.id };
}

/** A Red claim: a critical requirement with NO evidence at all (0 receipts). */
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

/** Attach an extra operator receipt of a given intake kind to an existing
 *  requirement (does not change the verdict — same requirement, extra evidence). */
function attachReceipt(
  campaignId: string,
  requirementId: string,
  opts: {
    type: string;
    machineOrHuman: "machine" | "human";
    intakeKind: "url" | "metric" | "image" | "text";
    uploadedAt: string;
  },
) {
  const item = createEvidenceItem(db, {
    campaignId,
    type: opts.type,
    machineOrHuman: opts.machineOrHuman,
    intakeKind: opts.intakeKind,
    uploadedAt: opts.uploadedAt,
  });
  createEvidenceLink(db, {
    evidenceItemId: item.id,
    proofRequirementId: requirementId,
    source: "operator",
  });
  return item.id;
}

function flipToRed(deliverableId: string) {
  createProofRequirement(db, {
    deliverableId,
    kind: "human-assertion",
    criticality: "critical",
  });
}

// --- AC3: appendix content per included Claim -------------------------------

describe("AC3 — the Proof Appendix lists per included Claim its labelled receipts", () => {
  test("a Green claim's receipt carries machine provenance, liveness, and a server timestamp", () => {
    const { campaignId, creatorId } = makeCampaign();
    const green = addGreenClaim(campaignId, creatorId);
    const view = createReport(db, campaignId, NOW);

    expect(view.appendix.map((e) => e.claimId)).toEqual([green.claimId]);
    const entry = view.appendix[0];
    expect(entry.creatorName).toBe("Nova");
    expect(entry.missingReceipt).toBe(false);
    const link = entry.receipts.find((r) => r.provenance === "machine");
    expect(link).toBeDefined();
    expect(link?.livenessLabel).toBe("live");
    expect(link?.timestamp).toBe(NOW);
  });

  test("a Red claim is ABSENT from the client appendix (it lives internal-only)", () => {
    const { campaignId, creatorId } = makeCampaign();
    addGreenClaim(campaignId, creatorId);
    const red = addRedClaim(campaignId, creatorId);
    const view = createReport(db, campaignId, NOW);

    expect(view.internalOnly.map((i) => i.claimId)).toEqual([red.claimId]);
    expect(view.appendix.map((e) => e.claimId)).not.toContain(red.claimId);
  });
});

// --- AC5: metric / viewer figures are ALWAYS a Human assertion (AD-19) ------

describe("AC5 — a metric receipt is always a Human assertion, never machine", () => {
  test("a metric-kind receipt surfaces in the appendix as human provenance", () => {
    const { campaignId, creatorId } = makeCampaign();
    const green = addGreenClaim(campaignId, creatorId);
    // A viewer/CCV figure attached to the same (satisfied) requirement — human.
    attachReceipt(campaignId, green.requirementId, {
      type: "viewer count",
      machineOrHuman: "human",
      intakeKind: "metric",
      uploadedAt: LATER,
    });
    const view = createReport(db, campaignId, NOW);

    const entry = view.appendix.find((e) => e.claimId === green.claimId);
    const metric = entry?.receipts.find((r) => r.evidenceType === "viewer count");
    expect(metric).toBeDefined();
    // The appendix reproduces the stored machine_or_human verbatim (AD-3/AD-19):
    // a metric figure is a Human assertion, never machine-verified.
    expect(metric?.provenance).toBe("human");
    // Tripwire: NO receipt for a metric figure may ever read as machine-verified.
    const anyMetricAsMachine = view.appendix
      .flatMap((e) => e.receipts)
      .some((r) => r.evidenceType === "viewer count" && r.provenance === "machine");
    expect(anyMetricAsMachine).toBe(false);
  });
});

// --- AC4: the appendix always travels; ≥1 receipt or it is surfaced ---------

describe("AC4 — appendix travels regardless of the byline; missing receipts surfaced", () => {
  test("removing the byline never removes or thins the appendix", () => {
    const { campaignId, creatorId } = makeCampaign();
    addGreenClaim(campaignId, creatorId);
    const created = createReport(db, campaignId, NOW);
    expect(created.bylineRemoved).toBe(false);
    const before = JSON.stringify(created.appendix);
    expect(created.appendix.length).toBeGreaterThan(0);

    const after = setReportByline(db, created.reportId, true);
    expect(after?.bylineRemoved).toBe(true);
    // Byte-for-byte identical appendix — provenance travels with the receipts,
    // not the byline (FR-12/FR-13).
    expect(JSON.stringify(after?.appendix)).toBe(before);
  });

  test("every included Claim carries ≥1 receipt", () => {
    const { campaignId, creatorId } = makeCampaign();
    addGreenClaim(campaignId, creatorId);
    addGreenClaim(campaignId, creatorId);
    const view = createReport(db, campaignId, NOW);
    expect(view.appendix.length).toBe(2);
    for (const entry of view.appendix) {
      expect(entry.receipts.length).toBeGreaterThan(0);
      expect(entry.missingReceipt).toBe(false);
    }
  });

  test("an override-included Claim with zero receipts is SURFACED, not silently shipped", async () => {
    const { campaignId, creatorId } = makeCampaign();
    const red = addRedClaim(campaignId, creatorId); // critical req, NO evidence
    const view = createReport(db, campaignId, NOW);
    const item = view.internalOnly.find((i) => i.claimId === red.claimId);
    // Include the Red claim with a recorded caveat + attribution (AD-21).
    createCaveat(db, { claimId: red.claimId, text: "Client accepted.", authoredBy: "op" });
    const { setReportItemInclusion } = await import("@/src/services");
    const after = setReportItemInclusion(db, {
      reportId: view.reportId,
      reportItemId: item?.reportItemId ?? "",
      override: "included",
      overriddenBy: "op",
    });

    const entry = after?.appendix.find((e) => e.claimId === red.claimId);
    expect(entry).toBeDefined();
    expect(entry?.receipts).toHaveLength(0);
    // FR-13: never fabricate a receipt — surface the gap for the operator.
    expect(entry?.missingReceipt).toBe(true);
  });
});

// --- AC6: a stale report withholds the appendix too (retro AI-3) ------------

describe("AC6 — a stale report withholds the appendix exactly like the split", () => {
  test("evidence mutation flips stale and empties the appendix", () => {
    const { campaignId, creatorId } = makeCampaign();
    const green = addGreenClaim(campaignId, creatorId);
    const v1 = createReport(db, campaignId, NOW);
    expect(v1.appendix.length).toBe(1);

    flipToRed(green.deliverableId);
    const stale = getReportBuilderView(db, v1.reportId);
    expect(stale?.stale).toBe(true);
    expect(stale?.appendix).toEqual([]);
    expect(stale?.clientVisible).toEqual([]);
  });
});

// --- AC2: byline default + per-version persistence --------------------------

describe("AC2 — the byline is present by default and per-version operator-removable", () => {
  test("a fresh report defaults to byline present; removal persists on re-read", () => {
    const { campaignId, creatorId } = makeCampaign();
    addGreenClaim(campaignId, creatorId);
    const v1 = createReport(db, campaignId, NOW);
    expect(v1.bylineRemoved).toBe(false);
    expect(getReport(db, v1.reportId)?.bylineRemoved).toBe(false);

    setReportByline(db, v1.reportId, true);
    expect(getReportBuilderView(db, v1.reportId)?.bylineRemoved).toBe(true);
    expect(getReport(db, v1.reportId)?.bylineRemoved).toBe(true);

    // A NEW version defaults back to byline present — the decision is per-version.
    const v2 = createReport(db, campaignId, LATER);
    expect(v2.bylineRemoved).toBe(false);
  });

  test("setReportByline on an unknown report is not-found (null)", () => {
    expect(setReportByline(db, "nope", true)).toBeNull();
  });
});

// --- The AI-3 structural gate still holds with the new presentation column --

describe("byline_removed is presentation-only — the AI-3 no-verdict gate still holds", () => {
  test("byline_removed exists on report and carries NO status enum", () => {
    const cols = getTableColumns(report);
    const byline = cols.bylineRemoved as { name: string; enumValues?: readonly string[] };
    expect(byline.name).toBe("byline_removed");
    // A boolean integer, not a Proof Status / inclusion / audience enum.
    expect(byline.enumValues).toBeUndefined();
  });
});
