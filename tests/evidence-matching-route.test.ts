// The matching Route Handlers (Story 2.2, AD-8/AD-17). Thin shells: Zod-validate
// the param + body at the boundary, delegate to the matching service, shape the
// HTTP response. Asserted contract:
//   1. Ingest now bundles the item's deterministic match state in its response.
//   2. Confirm/Reassign (assign) writes a source=operator link and returns the
//      new match state; the client never supplies `source`.
//   3. Bad body → 400 (writing nothing); unknown item/Deliverable → 404;
//      cross-campaign assignment → 400 (mixed-origin, AD-9).
//   4. Unassign reverses and returns the restored match state.
//
// The routes call the process getDb() singleton; we point it at an in-memory DB
// and a throwaway evidence dir, seeded once.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

process.env.DB_PATH = ":memory:";
const EVIDENCE_DIR = mkdtempSync(join(tmpdir(), "proofdesk-match-route-"));
process.env.EVIDENCE_DIR = EVIDENCE_DIR;

import { POST as assignPOST } from "@/app/api/evidence/[evidenceItemId]/assign/route";
import { POST as unassignPOST } from "@/app/api/evidence/[evidenceItemId]/unassign/route";
import { POST as evidencePOST } from "@/app/api/evidence/route";
import { SEED_DEMO_CAMPAIGN_ID, seedDemoCampaign } from "@/seed/demo-campaign";
import {
  createCampaign,
  createClaim,
  createClient,
  createCreator,
  createDeliverable,
  createEvidenceItem,
  createProofRequirement,
  getDb,
  listEvidenceLinks,
  runMigrations,
} from "@/src/repositories";

const D1_URL = "https://twitch.tv/pixelforge/segment-aurora";
let D1_ID = "";
let D3_ID = "";
let FOREIGN_DELIVERABLE_ID = "";

function ctx(evidenceItemId: string) {
  return { params: Promise.resolve({ evidenceItemId }) };
}

function jsonReq(body: unknown) {
  return new Request("http://test.local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A fresh ingested url-kind receipt in the demo campaign. */
function freshUrlItem(url = D1_URL) {
  return createEvidenceItem(getDb().db, {
    campaignId: SEED_DEMO_CAMPAIGN_ID,
    type: "link",
    machineOrHuman: "machine",
    intakeKind: "url",
    url,
    uploadedAt: "2026-06-01T09:00:00.000Z",
  });
}

function operatorLinkCount(evidenceItemId: string): number {
  return listEvidenceLinks(getDb().db, SEED_DEMO_CAMPAIGN_ID).filter(
    (l) => l.evidenceItemId === evidenceItemId && l.source === "operator",
  ).length;
}

beforeAll(() => {
  const handle = getDb();
  runMigrations(handle);
  const summary = seedDemoCampaign(handle.db);
  D1_ID = summary.deliverables.find((d) => d.key === "D1")?.deliverableId ?? "";
  D3_ID = summary.deliverables.find((d) => d.key === "D3")?.deliverableId ?? "";

  // A Deliverable in a DIFFERENT campaign, for the cross-campaign guard.
  const client = createClient(handle.db, "Other Co");
  const camp = createCampaign(handle.db, {
    clientId: client.id,
    name: "Other",
    dataOrigin: "real",
    isDemo: false,
  });
  const creator = createCreator(handle.db, camp.id, "Foreign", "foreign");
  const deliv = createDeliverable(handle.db, {
    campaignId: camp.id,
    creatorId: creator.id,
    type: "IG Reel",
    claimedStatus: "delivered",
  });
  createClaim(handle.db, deliv.id);
  createProofRequirement(handle.db, {
    deliverableId: deliv.id,
    kind: "proof-of-posting",
    criticality: "critical",
  });
  FOREIGN_DELIVERABLE_ID = deliv.id;
});

afterAll(() => {
  rmSync(EVIDENCE_DIR, { recursive: true, force: true });
});

describe("POST /api/evidence — bundles match state (Story 2.2)", () => {
  test("a URL matching one Deliverable ingests with a suggested match", async () => {
    const fd = new FormData();
    fd.set("campaignId", SEED_DEMO_CAMPAIGN_ID);
    fd.set("intakeKind", "url");
    fd.set("type", "link");
    fd.set("url", D1_URL);
    const res = await evidencePOST(
      new Request("http://test.local/api/evidence", { method: "POST", body: fd }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.match.status).toBe("suggested");
    expect(body.match.suggestion.creatorName).toBe("PixelForge");
    expect(body.match.suggestion.deliverableType).toBe("Twitch sponsor segment");
    // No confidence/score field anywhere in the suggestion payload.
    expect(Object.keys(body.match.suggestion).sort()).toEqual([
      "creatorName",
      "deliverableId",
      "deliverableType",
      "rule",
    ]);
  });

  test("an unmatchable URL ingests Unassigned", async () => {
    const fd = new FormData();
    fd.set("campaignId", SEED_DEMO_CAMPAIGN_ID);
    fd.set("intakeKind", "url");
    fd.set("type", "link");
    fd.set("url", "https://example.com/nothing");
    const res = await evidencePOST(
      new Request("http://test.local/api/evidence", { method: "POST", body: fd }),
    );
    expect((await res.json()).match.status).toBe("unassigned");
  });
});

describe("POST /api/evidence/[id]/assign — operator affirmation", () => {
  test("Confirm writes a source=operator link and returns assigned state", async () => {
    const item = freshUrlItem();
    const res = await assignPOST(jsonReq({ deliverableId: D1_ID }), ctx(item.id));
    expect(res.status).toBe(200);
    const { match } = await res.json();
    expect(match.status).toBe("assigned");
    expect(match.assignment.deliverableId).toBe(D1_ID);
    expect(operatorLinkCount(item.id)).toBe(1);
  });

  test("Reassign re-links; still exactly one operator link", async () => {
    const item = freshUrlItem();
    await assignPOST(jsonReq({ deliverableId: D1_ID }), ctx(item.id));
    const res = await assignPOST(jsonReq({ deliverableId: D3_ID }), ctx(item.id));
    const { match } = await res.json();
    expect(match.assignment.deliverableId).toBe(D3_ID);
    expect(operatorLinkCount(item.id)).toBe(1);
  });

  test("400 on a missing deliverableId, writing nothing", async () => {
    const item = freshUrlItem();
    const res = await assignPOST(jsonReq({}), ctx(item.id));
    expect(res.status).toBe(400);
    expect(operatorLinkCount(item.id)).toBe(0);
  });

  test("404 for an unknown evidence item", async () => {
    const res = await assignPOST(jsonReq({ deliverableId: D1_ID }), ctx("no-such-item"));
    expect(res.status).toBe(404);
  });

  test("400 for a cross-campaign assignment (mixed-origin, AD-9)", async () => {
    const item = freshUrlItem();
    const res = await assignPOST(jsonReq({ deliverableId: FOREIGN_DELIVERABLE_ID }), ctx(item.id));
    expect(res.status).toBe(400);
    expect(operatorLinkCount(item.id)).toBe(0);
  });
});

describe("POST /api/evidence/[id]/unassign — reversal (NFR-D7)", () => {
  test("drops the operator link and restores the rule suggestion", async () => {
    const item = freshUrlItem();
    await assignPOST(jsonReq({ deliverableId: D1_ID }), ctx(item.id));
    expect(operatorLinkCount(item.id)).toBe(1);

    const res = await unassignPOST(
      new Request("http://test.local", { method: "POST" }),
      ctx(item.id),
    );
    expect(res.status).toBe(200);
    const { match } = await res.json();
    expect(match.status).toBe("suggested");
    expect(operatorLinkCount(item.id)).toBe(0);
  });

  test("404 for an unknown evidence item", async () => {
    const res = await unassignPOST(
      new Request("http://test.local", { method: "POST" }),
      ctx("no-such-item"),
    );
    expect(res.status).toBe(404);
  });
});
