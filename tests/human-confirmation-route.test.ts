// The "page shows the Deliverable" confirm Route Handler (Story 2.3, AD-2/AD-8).
// A thin shell: Zod-validate the param + body at the boundary, resolve the
// operator identity and the clock in the shell (NOT from the body), delegate to
// the already-tested service, and shape the HTTP response. Contract asserted:
//   1. Invalid id / body is rejected with 400 before any effect.
//   2. `confirmed_by` is server-resolved — a forged value in the body is ignored.
//   3. An unknown Claim or link is a clean 404, not a 500.
//   4. The happy path returns the refreshed Claim Card view carrying the new
//      confirmation (single round-trip).
//
// Routes call the process `getDb()` singleton; we point it at an in-memory DB and
// build one unconfirmed proof-of-posting Claim to act on.

import { beforeAll, describe, expect, test } from "vitest";

process.env.DB_PATH = ":memory:";
process.env.OPERATOR_NAME = "ShellOperator";
delete process.env.OPERATOR_AGENCY;

import { POST as confirmPOST } from "@/app/api/claims/[claimId]/confirm/route";
import {
  createCampaign,
  createClaim,
  createClient,
  createCreator,
  createDeliverable,
  createEvidenceItem,
  createEvidenceLink,
  createProofRequirement,
  getDb,
  listHumanConfirmations,
  runMigrations,
} from "@/src/repositories";

let campaignId: string;
let claimId: string;
let evidenceLinkId: string;

function ctx(id: string) {
  return { params: Promise.resolve({ claimId: id }) };
}
function jsonRequest(body: unknown): Request {
  return new Request("http://test.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  const handle = getDb();
  runMigrations(handle);
  const db = handle.db;
  const client = createClient(db, "Acme");
  const campaign = createCampaign(db, {
    clientId: client.id,
    name: "Real",
    dataOrigin: "real",
    isDemo: false,
  });
  campaignId = campaign.id;
  const creator = createCreator(db, campaign.id, "Nova", "nova");
  const deliverable = createDeliverable(db, {
    campaignId: campaign.id,
    creatorId: creator.id,
    type: "Twitch sponsor segment",
    claimedStatus: "delivered",
    platformUrl: "https://twitch.tv/nova/seg",
  });
  claimId = createClaim(db, deliverable.id).id;
  const req = createProofRequirement(db, {
    deliverableId: deliverable.id,
    kind: "proof-of-posting",
    criticality: "critical",
  });
  const item = createEvidenceItem(db, {
    campaignId: campaign.id,
    type: "link",
    machineOrHuman: "machine",
    uploadedAt: "2026-05-12T20:11:00.000Z",
    livenessLabel: "live",
  });
  evidenceLinkId = createEvidenceLink(db, {
    evidenceItemId: item.id,
    proofRequirementId: req.id,
    source: "operator",
  }).id;
});

describe("POST /api/claims/[claimId]/confirm — validation (AD-8)", () => {
  test("rejects a malformed JSON body with 400", async () => {
    const bad = new Request("http://test.local", { method: "POST", body: "not json" });
    const res = await confirmPOST(bad, ctx(claimId));
    expect(res.status).toBe(400);
  });

  test("rejects a body with no evidenceLinkId with 400", async () => {
    const res = await confirmPOST(jsonRequest({ evidenceLinkId: "" }), ctx(claimId));
    expect(res.status).toBe(400);
  });

  test("404 for a non-existent Claim", async () => {
    const res = await confirmPOST(jsonRequest({ evidenceLinkId }), ctx("no-such-claim"));
    expect(res.status).toBe(404);
  });

  test("404 for a link that is not on this Claim", async () => {
    const res = await confirmPOST(jsonRequest({ evidenceLinkId: "no-such-link" }), ctx(claimId));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/claims/[claimId]/confirm — happy path (FR-7, AD-18)", () => {
  test("appends a confirmation authored by the SHELL identity, not the body", async () => {
    const res = await confirmPOST(
      jsonRequest({
        evidenceLinkId,
        confirmedBy: "Forged",
        confirmedAt: "1999-01-01T00:00:00.000Z",
      }),
      ctx(claimId),
    );
    expect(res.status).toBe(200);
    const view = await res.json();
    const ev = view.requirements
      .flatMap((r: { evidence: unknown[] }) => r.evidence)
      .find((e: { evidenceLinkId: string }) => e.evidenceLinkId === evidenceLinkId);
    expect(ev.confirmations.length).toBe(1);

    // The persisted author/clock are server-resolved, never the body values.
    const stored = listHumanConfirmations(getDb().db, campaignId);
    expect(stored).toHaveLength(1);
    expect(stored[0].confirmedBy).toBe("ShellOperator");
    expect(stored[0].confirmedAt).not.toBe("1999-01-01T00:00:00.000Z");
    expect(stored[0].machineOrHuman).toBe("human");
  });
});
