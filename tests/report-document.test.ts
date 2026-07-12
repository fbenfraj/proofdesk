// Story 4.3 — the SHELL document assembler (app/_lib/report-document). It turns a
// frozen builder view into the fully-resolved render model: injects the
// single-source design tokens (drift guard), base64-inlines screenshots through
// the storage adapter, and carries the honesty invariants into the client
// document — metric = Human verbatim (AD-19), Red absent, stale withheld, caveats
// shown. Uses an in-memory DB + a fake storage so no disk is touched.

import { beforeEach, describe, expect, test } from "vitest";
import { PROOF_STATUS_TOKENS, PROVENANCE_TOKENS } from "@/app/_lib/design-tokens";
import { assembleReportDocumentHtml, buildReportDocumentModel } from "@/app/_lib/report-document";
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
} from "@/src/repositories";
import { createReport, getReportBuilderView, setReportItemInclusion } from "@/src/services";

const NOW = "2026-07-12T00:00:00.000Z";
const LATER = "2026-07-12T01:00:00.000Z";

let handle: DbHandle;
let db: Db;

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
});

/** A storage double backed by a plain map of key → bytes/contentType. */
function fakeStorage(files: Record<string, { bytes: Uint8Array; contentType: string }> = {}) {
  return {
    async get(key: string) {
      return files[key] ?? null;
    },
  };
}

function makeCampaign() {
  const client = createClient(db, "Lumen");
  const campaign = createCampaign(db, {
    clientId: client.id,
    name: "Lumen × Twitch Sprint",
    dataOrigin: "real",
    isDemo: false,
  });
  const creator = createCreator(db, campaign.id, "Malo", "malo");
  return { campaignId: campaign.id, creatorId: creator.id };
}

function addGreenClaim(campaignId: string, creatorId: string, type = "twitch-sponsor-segment") {
  const deliverable = createDeliverable(db, {
    campaignId,
    creatorId,
    type,
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
    url: "https://twitch.tv/videos/2141906",
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

function addRedClaim(campaignId: string, creatorId: string) {
  const deliverable = createDeliverable(db, {
    campaignId,
    creatorId,
    type: "instagram-story",
    claimedStatus: "delivered",
  });
  const claim = createClaim(db, deliverable.id);
  createProofRequirement(db, {
    deliverableId: deliverable.id,
    kind: "proof-of-posting",
    criticality: "critical",
  });
  return { claimId: claim.id };
}

function attachReceipt(
  campaignId: string,
  requirementId: string,
  opts: {
    type: string;
    machineOrHuman: "machine" | "human";
    intakeKind: "url" | "metric" | "image" | "text";
    url?: string;
    note?: string;
    storageKey?: string;
    contentType?: string;
    originalFilename?: string;
  },
) {
  const item = createEvidenceItem(db, {
    campaignId,
    type: opts.type,
    machineOrHuman: opts.machineOrHuman,
    intakeKind: opts.intakeKind,
    url: opts.url,
    note: opts.note,
    storageKey: opts.storageKey,
    contentType: opts.contentType,
    originalFilename: opts.originalFilename,
    uploadedAt: LATER,
  });
  createEvidenceLink(db, {
    evidenceItemId: item.id,
    proofRequirementId: requirementId,
    source: "operator",
  });
  return item.id;
}

// --- AC1/AC6: base64 inlining + design-token injection ----------------------

describe("the assembler inlines screenshots as base64 and injects single-source tokens", () => {
  test("a screenshot receipt is inlined as a data: URI read through the storage adapter", async () => {
    const { campaignId, creatorId } = makeCampaign();
    const green = addGreenClaim(campaignId, creatorId);
    attachReceipt(campaignId, green.requirementId, {
      type: "Disclosure screenshot",
      machineOrHuman: "machine",
      intakeKind: "image",
      storageKey: "c/shot.png",
      contentType: "image/png",
      originalFilename: "overlay.png",
    });
    const view = getReportBuilderView(db, createReport(db, campaignId, NOW).reportId);
    if (!view) throw new Error("view");
    const bytes = new Uint8Array([137, 80, 78, 71]); // PNG magic
    const storage = fakeStorage({ "c/shot.png": { bytes, contentType: "image/png" } });

    const model = await buildReportDocumentModel(storage, view, "Lumen × Twitch Sprint", "en");
    const receipt = model.appendix.flatMap((a) => a.receipts).find((r) => r.value.kind === "image");
    expect(receipt).toBeDefined();
    if (receipt?.value.kind === "image") {
      const expected = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
      expect(receipt.value.dataUri).toBe(expected);
      expect(receipt.value.alt).toBe("overlay.png");
    }
  });

  test("a missing screenshot file degrades gracefully — no crash, no fabricated image", async () => {
    const { campaignId, creatorId } = makeCampaign();
    const green = addGreenClaim(campaignId, creatorId);
    attachReceipt(campaignId, green.requirementId, {
      type: "Disclosure screenshot",
      machineOrHuman: "machine",
      intakeKind: "image",
      storageKey: "c/gone.png",
      contentType: "image/png",
    });
    const view = getReportBuilderView(db, createReport(db, campaignId, NOW).reportId);
    if (!view) throw new Error("view");
    // Storage has NO file for the key → get() returns null.
    const model = await buildReportDocumentModel(fakeStorage(), view, "Camp", "en");
    const kinds = model.appendix.flatMap((a) => a.receipts).map((r) => r.value.kind);
    expect(kinds).not.toContain("image"); // fell back, never crashed
  });

  test("status + provenance colours are injected from the design tokens (drift guard)", async () => {
    const { campaignId, creatorId } = makeCampaign();
    addGreenClaim(campaignId, creatorId);
    const view = getReportBuilderView(db, createReport(db, campaignId, NOW).reportId);
    if (!view) throw new Error("view");
    const model = await buildReportDocumentModel(fakeStorage(), view, "Camp", "en");

    const green = model.claims[0];
    expect(green.status.ink).toBe(PROOF_STATUS_TOKENS.defensible.ink);
    expect(green.status.fill).toBe(PROOF_STATUS_TOKENS.defensible.fill);
    expect(green.status.border).toBe(PROOF_STATUS_TOKENS.defensible.border);
    expect(green.status.glyph).toBe(PROOF_STATUS_TOKENS.defensible.glyph);

    const machine = model.appendix[0].receipts.find((r) => r.provenance.glyph === "✓");
    expect(machine?.provenance.ink).toBe(PROVENANCE_TOKENS.machine.ink);
    expect(machine?.provenance.bg).toBe(PROVENANCE_TOKENS.machine.bg);
  });
});

// --- AC6: metric = Human, faithful (tripwire) -------------------------------

describe("metric receipts are reproduced as Human assertions, never machine", () => {
  test("a metric receipt renders as human provenance in the document model", async () => {
    const { campaignId, creatorId } = makeCampaign();
    const green = addGreenClaim(campaignId, creatorId);
    attachReceipt(campaignId, green.requirementId, {
      type: "viewer count",
      machineOrHuman: "human",
      intakeKind: "metric",
      note: "5,380 peak concurrent",
    });
    const view = getReportBuilderView(db, createReport(db, campaignId, NOW).reportId);
    if (!view) throw new Error("view");
    const model = await buildReportDocumentModel(fakeStorage(), view, "Camp", "en");

    const metric = model.appendix
      .flatMap((a) => a.receipts)
      .find((r) => r.kindLabel === "viewer count");
    expect(metric?.provenance.glyph).toBe(PROVENANCE_TOKENS.human.glyph);
    expect(metric?.provenance.ink).toBe(PROVENANCE_TOKENS.human.ink);
    // Tripwire: no metric receipt anywhere may read as machine.
    const anyMachineMetric = model.appendix
      .flatMap((a) => a.receipts)
      .some((r) => r.kindLabel === "viewer count" && r.provenance.glyph === "✓");
    expect(anyMachineMetric).toBe(false);
  });
});

// --- AC6: Red absent, stale withheld, caveats shown -------------------------

describe("the client document withholds Red, withholds stale, and shows caveats", () => {
  test("a Red claim never appears in the client document model", async () => {
    const { campaignId, creatorId } = makeCampaign();
    addGreenClaim(campaignId, creatorId);
    const red = addRedClaim(campaignId, creatorId);
    const view = getReportBuilderView(db, createReport(db, campaignId, NOW).reportId);
    if (!view) throw new Error("view");
    const model = await buildReportDocumentModel(fakeStorage(), view, "Camp", "en");

    expect(model.claims.some((c) => c.creatorName === "")).toBe(false);
    expect(model.claims).toHaveLength(1); // only the Green claim
    expect(view.internalOnly.map((i) => i.claimId)).toContain(red.claimId);
  });

  test("a client-visible claim with ZERO receipts is withheld — the report never overstates 'backed by receipts' (FR-13)", async () => {
    const { campaignId, creatorId } = makeCampaign();
    addGreenClaim(campaignId, creatorId); // has a receipt → shippable
    const red = addRedClaim(campaignId, creatorId); // critical req, NO evidence
    const view = getReportBuilderView(db, createReport(db, campaignId, NOW).reportId);
    if (!view) throw new Error("view");
    const item = view.internalOnly.find((i) => i.claimId === red.claimId);
    // Operator override-includes the Red claim with a recorded caveat (AD-21) — but
    // there is still no receipt on file (missingReceipt surfaced in the builder).
    createCaveat(db, { claimId: red.claimId, text: "Client accepted.", authoredBy: "op" });
    const included = setReportItemInclusion(db, {
      reportId: view.reportId,
      reportItemId: item?.reportItemId ?? "",
      override: "included",
      overriddenBy: "op",
    });
    if (!included) throw new Error("included");
    const redEntry = included.appendix.find((e) => e.claimId === red.claimId);
    expect(redEntry?.missingReceipt).toBe(true); // builder still surfaces the gap

    const model = await buildReportDocumentModel(fakeStorage(), included, "Camp", "en");
    // The CLIENT document withholds the unbacked claim — only the Green (backed) one
    // ships, so the "each backed by receipts" summary copy is true by construction.
    expect(model.claims).toHaveLength(1);
    expect(model.appendix.every((a) => a.receipts.length > 0)).toBe(true);
  });

  test("an override-included Red claim is counted in the summary, matching the body (AD-21)", async () => {
    const { campaignId, creatorId } = makeCampaign();
    addGreenClaim(campaignId, creatorId); // Green, has a receipt
    // A Green claim forced effective-Red by an override, but it keeps its receipt.
    const red = addGreenClaim(campaignId, creatorId);
    createHumanOverride(db, { claimId: red.claimId, finalStatus: "red", authoredBy: "op" });
    createCaveat(db, { claimId: red.claimId, text: "Client accepted the risk.", authoredBy: "op" });
    const view = getReportBuilderView(db, createReport(db, campaignId, NOW).reportId);
    if (!view) throw new Error("view");
    const item = view.internalOnly.find((i) => i.claimId === red.claimId);
    const included = setReportItemInclusion(db, {
      reportId: view.reportId,
      reportItemId: item?.reportItemId ?? "",
      override: "included",
      overriddenBy: "op",
    });
    if (!included) throw new Error("included");

    const model = await buildReportDocumentModel(fakeStorage(), included, "Camp", "en");
    // Body: both the Green and the override-included Red claim ship.
    expect(model.claims).toHaveLength(2);
    // Summary: the Red claim IS counted (cant-claim), matching the body total — the
    // summary never undercounts what the client actually sees.
    const totalCounted = model.summaryCounts.reduce((n, c) => n + c.count, 0);
    expect(totalCounted).toBe(model.claims.length);
    expect(
      model.summaryCounts.some((c) => c.label === PROOF_STATUS_TOKENS["cant-claim"].labelEn),
    ).toBe(true);
  });

  test("a stale report renders the withheld empty-state note, no claims/appendix", async () => {
    const { campaignId, creatorId } = makeCampaign();
    const green = addGreenClaim(campaignId, creatorId);
    const created = createReport(db, campaignId, NOW);
    // Mutate evidence after the freeze → the live hash diverges → stale.
    createProofRequirement(db, {
      deliverableId: green.deliverableId,
      kind: "human-assertion",
      criticality: "critical",
    });
    const view = getReportBuilderView(db, created.reportId);
    if (!view) throw new Error("view");
    expect(view.stale).toBe(true);

    const model = await buildReportDocumentModel(fakeStorage(), view, "Camp", "en");
    expect(model.emptyStateNote).not.toBeNull();
    expect(model.claims).toHaveLength(0);
    expect(model.appendix).toHaveLength(0);
  });

  test("a client-visible Yellow still awaiting a caveat is WITHHELD from the client document (AD-6)", async () => {
    const { campaignId, creatorId } = makeCampaign();
    const green = addGreenClaim(campaignId, creatorId);
    // Force effective-Yellow via override but author NO caveat → requiresCaveat.
    createHumanOverride(db, { claimId: green.claimId, finalStatus: "yellow", authoredBy: "op" });
    const view = getReportBuilderView(db, createReport(db, campaignId, NOW).reportId);
    if (!view) throw new Error("view");
    // The builder still surfaces it to the operator, flagged.
    expect(view.clientVisible[0].requiresCaveat).toBe(true);

    const model = await buildReportDocumentModel(fakeStorage(), view, "Camp", "en");
    // Never shipped bare — absent from the client claims AND appendix.
    expect(model.claims).toHaveLength(0);
    expect(model.appendix).toHaveLength(0);
    expect(model.emptyStateNote).not.toBeNull();

    // Author the caveat → it is now client-includable and appears WITH its caveat.
    createCaveat(db, {
      claimId: green.claimId,
      text: "Client accepted the gap.",
      authoredBy: "op",
    });
    const view2 = getReportBuilderView(db, createReport(db, campaignId, LATER).reportId);
    if (!view2) throw new Error("view2");
    const model2 = await buildReportDocumentModel(fakeStorage(), view2, "Camp", "en");
    expect(model2.claims).toHaveLength(1);
    expect(model2.claims[0].caveats).toContain("Client accepted the gap.");
  });

  test("a Caveated (effective-Yellow) claim carries its caveat text into the model", async () => {
    const { campaignId, creatorId } = makeCampaign();
    const green = addGreenClaim(campaignId, creatorId);
    // Force the claim effective-Yellow via a human override, with a caveat.
    createHumanOverride(db, { claimId: green.claimId, finalStatus: "yellow", authoredBy: "op" });
    createCaveat(db, {
      claimId: green.claimId,
      text: "Rests on the creator's word — needs a timestamped clip.",
      authoredBy: "op",
    });
    const view = getReportBuilderView(db, createReport(db, campaignId, NOW).reportId);
    if (!view) throw new Error("view");
    const model = await buildReportDocumentModel(fakeStorage(), view, "Camp", "en");

    const claim = model.claims[0];
    expect(claim.status.label).toBe(PROOF_STATUS_TOKENS.caveated.labelEn);
    expect(claim.caveats).toContain("Rests on the creator's word — needs a timestamped clip.");
  });
});

// --- FR locale --------------------------------------------------------------

describe("FR locale resolves localized copy and status labels", () => {
  test("the model renders FR headings and FR status labels", async () => {
    const { campaignId, creatorId } = makeCampaign();
    addGreenClaim(campaignId, creatorId);
    const view = getReportBuilderView(db, createReport(db, campaignId, NOW).reportId);
    if (!view) throw new Error("view");
    const model = await buildReportDocumentModel(fakeStorage(), view, "Camp", "fr");

    expect(model.claimsHeading).toBe("Revendications");
    expect(model.appendixHeading).toBe("Annexe de preuves");
    expect(model.claims[0].status.label).toBe(PROOF_STATUS_TOKENS.defensible.labelFr);
  });
});

// --- assembleReportDocumentHtml: no report → null ---------------------------

describe("assembleReportDocumentHtml returns null when there is no report yet", () => {
  test("a campaign with no report yields null (→ the route 404s, the page empties)", async () => {
    const { campaignId } = makeCampaign();
    const html = await assembleReportDocumentHtml(db, fakeStorage(), campaignId, "en");
    expect(html).toBeNull();
  });

  test("with a report, it renders a self-contained document string", async () => {
    const { campaignId, creatorId } = makeCampaign();
    addGreenClaim(campaignId, creatorId);
    createReport(db, campaignId, NOW);
    const html = await assembleReportDocumentHtml(db, fakeStorage(), campaignId, "en");
    expect(html).not.toBeNull();
    expect(html?.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Proof Appendix");
  });
});
