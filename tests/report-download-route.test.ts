// Story 4.4 — the GET /report/download Route Handler. Thin shell: it returns the
// portable ZIP as an `application/zip` attachment for a REAL campaign's non-stale
// report, and maps the honesty gates to status codes — demo → 403 (the AD-9
// export hard-wall), stale → 409 (recompute-or-refuse), no report → 404. A
// malformed locale cookie must never 500 (reuses 4.2's safety). Uses the process
// getDb() singleton pointed at :memory: + the real seed, like report-route tests.

import { unzipSync } from "fflate";
import { beforeAll, describe, expect, test } from "vitest";

process.env.DB_PATH = ":memory:";
process.env.OPERATOR_NAME = "ShellOperator";
process.env.OPERATOR_AGENCY = "Studio Kairos";

import { GET as downloadGET } from "@/app/api/campaigns/[campaignId]/report/download/route";
import { SEED_DEMO_CAMPAIGN_ID, seedDemoCampaign } from "@/seed/demo-campaign";
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
  type Db,
  getDb,
  runMigrations,
} from "@/src/repositories";
import { createReport } from "@/src/services";

const NOW = "2026-07-12T00:00:00.000Z";
let realCampaignId: string;
let staleCampaignId: string;

function ctx(campaignId: string) {
  return { params: Promise.resolve({ campaignId }) };
}
function req(cookie?: string): Request {
  return new Request("http://test.local", cookie ? { headers: { cookie } } : undefined);
}

/** A real campaign with one Green claim (live confirmed link) + a frozen report. */
function seedRealCampaign(db: Db, name: string): string {
  const client = createClient(db, "Acme");
  const campaign = createCampaign(db, {
    clientId: client.id,
    name,
    dataOrigin: "real",
    isDemo: false,
  });
  const creator = createCreator(db, campaign.id, "Malo", "malo");
  const deliverable = createDeliverable(db, {
    campaignId: campaign.id,
    creatorId: creator.id,
    type: "twitch-sponsor-segment",
    claimedStatus: "delivered",
  });
  createClaim(db, deliverable.id);
  const req_ = createProofRequirement(db, {
    deliverableId: deliverable.id,
    kind: "proof-of-posting",
    criticality: "critical",
  });
  const link = createEvidenceItem(db, {
    campaignId: campaign.id,
    type: "link",
    machineOrHuman: "machine",
    intakeKind: "url",
    url: "https://twitch.tv/videos/2141906",
    livenessLabel: "live",
    uploadedAt: NOW,
  });
  const el = createEvidenceLink(db, {
    evidenceItemId: link.id,
    proofRequirementId: req_.id,
    source: "operator",
  });
  appendHumanConfirmation(db, { evidenceLinkId: el.id, confirmedBy: "op", confirmedAt: NOW });
  return campaign.id;
}

beforeAll(() => {
  const handle = getDb();
  runMigrations(handle);
  seedDemoCampaign(handle.db);
  createReport(handle.db, SEED_DEMO_CAMPAIGN_ID, NOW);

  realCampaignId = seedRealCampaign(handle.db, "Lumen Q3");
  createReport(handle.db, realCampaignId, NOW);

  // A campaign whose report goes stale (evidence mutated after the freeze).
  staleCampaignId = seedRealCampaign(handle.db, "Nova Q3");
  createReport(handle.db, staleCampaignId, NOW);
  const c = getDb().db;
  const extra = createEvidenceItem(c, {
    campaignId: staleCampaignId,
    type: "link",
    machineOrHuman: "machine",
    intakeKind: "url",
    url: "https://twitch.tv/videos/9999999",
    livenessLabel: "live",
    uploadedAt: NOW,
  });
  // Link it to a fresh requirement on a new deliverable so the campaign hash moves.
  const del = createDeliverable(c, {
    campaignId: staleCampaignId,
    creatorId: createCreator(c, staleCampaignId, "Rae", "rae").id,
    type: "instagram-story",
    claimedStatus: "delivered",
  });
  createClaim(c, del.id);
  const r = createProofRequirement(c, {
    deliverableId: del.id,
    kind: "proof-of-posting",
    criticality: "critical",
  });
  createEvidenceLink(c, { evidenceItemId: extra.id, proofRequirementId: r.id, source: "operator" });
});

describe("GET /api/campaigns/[campaignId]/report/download", () => {
  test("a real campaign's report downloads as an application/zip attachment (AC1/5)", async () => {
    const res = await downloadGET(req(), ctx(realCampaignId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    const cd = res.headers.get("content-disposition") ?? "";
    expect(cd).toContain("attachment");
    expect(cd).toMatch(/filename="studio-kairos_proof-of-performance_lumen-q3-v\d+\.zip"/);
    // Client evidence — never cached by a browser/proxy.
    expect(res.headers.get("cache-control")).toContain("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toContain("report.html");
    expect(Object.keys(entries)).toContain("manifest.csv");
    expect(Object.keys(entries)).toContain("manifest.json");
  });

  test("a DEMO campaign is walled with 403, no zip (AC3, AD-9)", async () => {
    const res = await downloadGET(req(), ctx(SEED_DEMO_CAMPAIGN_ID));
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("a stale report is refused with 409 (AC6, AI-3)", async () => {
    const res = await downloadGET(req(), ctx(staleCampaignId));
    expect(res.status).toBe(409);
  });

  test("a campaign with no report is a clean 404", async () => {
    const res = await downloadGET(req(), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  test("a malformed locale cookie must not 500 (reuses 4.2 safety)", async () => {
    const res = await downloadGET(req("proofdesk_locale=%E0%A4%A"), ctx(realCampaignId));
    expect(res.status).toBe(200);
  });
});
