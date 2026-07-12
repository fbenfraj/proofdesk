// Story 4.4 — the SHELL export assembler (app/_lib/report-export). The is_demo
// EXPORT HARD-WALL (AD-9), stale-refuse (AI-3), the includable set shared with the
// document (AD-21/FR-13), the faithful `data_origin` manifest column (AD-9), and
// the meaningful download filename (AD-11) — all tested over an in-memory DB with
// a fake storage (no disk). The pure builders are covered in report-manifest.test.

import { unzipSync } from "fflate";
import { beforeEach, describe, expect, test } from "vitest";
import { buildReportDownload } from "@/app/_lib/report-export";
import {
  appendHumanConfirmation,
  createCampaign,
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
} from "@/src/repositories";
import { createReport } from "@/src/services";

const NOW = "2026-07-12T00:00:00.000Z";

let handle: DbHandle;
let db: Db;

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
});

function fakeStorage(files: Record<string, { bytes: Uint8Array; contentType: string }> = {}) {
  return {
    async get(key: string) {
      return files[key] ?? null;
    },
  };
}

function makeCampaign(opts: { isDemo: boolean }) {
  const client = createClient(db, "Lumen");
  const campaign = createCampaign(db, {
    clientId: client.id,
    name: "Lumen × Twitch Sprint",
    dataOrigin: opts.isDemo ? "seeded" : "real",
    isDemo: opts.isDemo,
  });
  const creator = createCreator(db, campaign.id, "Malo", "malo");
  return { campaignId: campaign.id, creatorId: creator.id };
}

/** A Green claim: a live, operator-confirmed link receipt + an operator-attached
 *  screenshot receipt (so the bundle carries an evidence file). */
function addGreenClaim(campaignId: string, creatorId: string) {
  const deliverable = createDeliverable(db, {
    campaignId,
    creatorId,
    type: "twitch-sponsor-segment",
    claimedStatus: "delivered",
  });
  const claim = createClaim(db, deliverable.id);
  const req = createProofRequirement(db, {
    deliverableId: deliverable.id,
    kind: "proof-of-posting",
    criticality: "critical",
  });
  const link = createEvidenceItem(db, {
    campaignId,
    type: "link",
    machineOrHuman: "machine",
    intakeKind: "url",
    url: "https://twitch.tv/videos/2141906",
    livenessLabel: "live",
    uploadedAt: NOW,
  });
  const linkLink = createEvidenceLink(db, {
    evidenceItemId: link.id,
    proofRequirementId: req.id,
    source: "operator",
  });
  appendHumanConfirmation(db, { evidenceLinkId: linkLink.id, confirmedBy: "op", confirmedAt: NOW });
  const shot = createEvidenceItem(db, {
    campaignId,
    type: "screenshot",
    machineOrHuman: "human",
    intakeKind: "image",
    storageKey: "c/shot.png",
    contentType: "image/png",
    originalFilename: "overlay.png",
    uploadedAt: NOW,
  });
  createEvidenceLink(db, {
    evidenceItemId: shot.id,
    proofRequirementId: req.id,
    source: "operator",
  });
  return { claimId: claim.id, requirementId: req.id };
}

/** A Red claim (a critical requirement with no evidence) — internal-only, absent
 *  from the client bundle. */
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

const storageWithShot = () =>
  fakeStorage({
    "c/shot.png": { bytes: new Uint8Array([137, 80, 78, 71]), contentType: "image/png" },
  });

describe("buildReportDownload — a REAL campaign's non-stale report (AC1/2/5/7)", () => {
  test("produces an openable ZIP with report.html + manifests + evidence, data_origin=real", async () => {
    const { campaignId, creatorId } = makeCampaign({ isDemo: false });
    addGreenClaim(campaignId, creatorId);
    createReport(db, campaignId, NOW);

    const result = await buildReportDownload(db, storageWithShot(), campaignId, "en");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    // Meaningful, deterministic filename (agency slug "proofdesk" by default).
    expect(result.filename).toMatch(
      /^proofdesk_proof-of-performance_lumen-twitch-sprint-v\d+\.zip$/,
    );

    const entries = unzipSync(result.bytes);
    const names = Object.keys(entries);
    expect(names).toContain("report.html");
    expect(names).toContain("manifest.csv");
    expect(names).toContain("manifest.json");
    expect(names.some((n) => n.startsWith("evidence/A1/"))).toBe(true);

    const csv = new TextDecoder().decode(entries["manifest.csv"]);
    expect(csv.split(/\r?\n/)[0]).toContain("data_origin");
    // Every exported evidence row is `real` (no seeded leak).
    const dataLines = csv.trimEnd().split(/\r?\n/).slice(1);
    expect(dataLines.length).toBeGreaterThan(0);
    for (const line of dataLines) expect(line).toContain("real");

    const json = JSON.parse(new TextDecoder().decode(entries["manifest.json"]));
    expect(json.rows.every((r: { data_origin: string }) => r.data_origin === "real")).toBe(true);
    // The metric/screenshot row is human (AD-19, faithful).
    expect(
      json.rows.some((r: { machine_or_human: string }) => r.machine_or_human === "human"),
    ).toBe(true);
  });

  test("a Red / internal-only claim is ABSENT from the manifest (AD-21)", async () => {
    const { campaignId, creatorId } = makeCampaign({ isDemo: false });
    addGreenClaim(campaignId, creatorId);
    addRedClaim(campaignId, creatorId);
    createReport(db, campaignId, NOW);

    const result = await buildReportDownload(db, storageWithShot(), campaignId, "en");
    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
    const json = JSON.parse(new TextDecoder().decode(unzipSync(result.bytes)["manifest.json"]));
    // Only the Green claim (A1) ships; the Red claim contributes no rows.
    expect(json.rows.every((r: { proof_status: string }) => r.proof_status !== "red")).toBe(true);
    expect(json.rows.every((r: { claim_ref: string }) => r.claim_ref === "A1")).toBe(true);
  });
});

describe("buildReportDownload — the honesty gates", () => {
  test("a DEMO campaign is walled: kind='demo', no bytes, even WITH a report (AC3, AD-9)", async () => {
    const { campaignId, creatorId } = makeCampaign({ isDemo: true });
    addGreenClaim(campaignId, creatorId);
    createReport(db, campaignId, NOW); // a real, freezable report exists…

    const result = await buildReportDownload(db, storageWithShot(), campaignId, "en");
    // …but the wall fires first — never an "ok"/bytes for a demo.
    expect(result.kind).toBe("demo");
    expect(result).not.toHaveProperty("bytes");
  });

  test("a STALE report refuses to export: kind='stale' (AC6, AI-3)", async () => {
    const { campaignId, creatorId } = makeCampaign({ isDemo: false });
    addGreenClaim(campaignId, creatorId);
    createReport(db, campaignId, NOW);
    // Mutate evidence after the freeze → the live campaign hash diverges → stale.
    addGreenClaim(campaignId, creatorId);

    const result = await buildReportDownload(db, storageWithShot(), campaignId, "en");
    expect(result.kind).toBe("stale");
  });

  test("no report yet → kind='none'", async () => {
    const { campaignId } = makeCampaign({ isDemo: false });
    const result = await buildReportDownload(db, fakeStorage(), campaignId, "en");
    expect(result.kind).toBe("none");
  });

  test("a missing evidence file is skipped, not crashed (bundle still builds)", async () => {
    const { campaignId, creatorId } = makeCampaign({ isDemo: false });
    addGreenClaim(campaignId, creatorId);
    createReport(db, campaignId, NOW);
    // Storage has NO bytes for c/shot.png → the file is skipped; the manifest row
    // still records the receipt honestly with a NULL evidence_path (not bundled).
    const result = await buildReportDownload(db, fakeStorage(), campaignId, "en");
    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
    const entries = unzipSync(result.bytes);
    expect(Object.keys(entries)).toContain("manifest.json");
    expect(Object.keys(entries).some((n) => n.startsWith("evidence/"))).toBe(false);
    const json = JSON.parse(new TextDecoder().decode(entries["manifest.json"]));
    // The screenshot receipt's row exists but its path is null (honestly "not bundled").
    const shotRow = json.rows.find(
      (r: { evidence_type: string }) => r.evidence_type === "screenshot",
    );
    expect(shotRow.evidence_path).toBeNull();
  });

  test("a bundled screenshot's manifest row names its exact in-bundle path (row↔file map)", async () => {
    const { campaignId, creatorId } = makeCampaign({ isDemo: false });
    addGreenClaim(campaignId, creatorId);
    createReport(db, campaignId, NOW);
    const result = await buildReportDownload(db, storageWithShot(), campaignId, "en");
    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
    const entries = unzipSync(result.bytes);
    const json = JSON.parse(new TextDecoder().decode(entries["manifest.json"]));
    const shotRow = json.rows.find(
      (r: { evidence_type: string }) => r.evidence_type === "screenshot",
    );
    expect(shotRow.evidence_path).toBeTruthy();
    // Every named path resolves to a real entry in the ZIP — no dangling reference.
    expect(Object.keys(entries)).toContain(shotRow.evidence_path);
  });
});
