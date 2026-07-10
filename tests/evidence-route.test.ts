// The Evidence Inbox ingest Route Handler (Story 2.1, AD-2/AD-8). The route is a
// thin shell: accept multipart/form-data, Zod-validate at the boundary before any
// effect, derive provenance server-side, and shape the HTTP response. These tests
// assert the shell contract:
//   1. Malformed / missing fields and bad files are rejected with 400, writing
//      NOTHING (no row, no stored file).
//   2. Provenance / uploaded_at / data_origin are server-owned — a client cannot
//      supply or forge them (they are simply never read from the request).
//   3. An unknown Campaign is a clean 404.
//   4. The happy path stores the receipt and returns the view (201).
//
// The route calls the process getDb()/getStorage() singletons; we point them at an
// in-memory DB and a throwaway evidence dir, seeded once.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

process.env.DB_PATH = ":memory:";
const EVIDENCE_DIR = mkdtempSync(join(tmpdir(), "proofdesk-route-"));
process.env.EVIDENCE_DIR = EVIDENCE_DIR;

import { POST as evidencePOST } from "@/app/api/evidence/route";
import { SEED_DEMO_CAMPAIGN_ID, seedDemoCampaign } from "@/seed/demo-campaign";
import { getDb, listEvidenceItems, runMigrations } from "@/src/repositories";

function multipart(
  fields: Record<string, string>,
  file?: { name: string; type: string; bytes: Uint8Array },
): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) {
    fd.append("file", new File([file.bytes as BlobPart], file.name, { type: file.type }));
  }
  return new Request("http://test.local/api/evidence", { method: "POST", body: fd });
}

function evidenceCount(): number {
  return listEvidenceItems(getDb().db, SEED_DEMO_CAMPAIGN_ID).length;
}

beforeAll(() => {
  const handle = getDb();
  runMigrations(handle);
  seedDemoCampaign(handle.db);
});

afterAll(() => {
  rmSync(EVIDENCE_DIR, { recursive: true, force: true });
});

describe("POST /api/evidence — validation (AD-8), writes nothing on failure", () => {
  test("rejects a missing intakeKind with 400", async () => {
    const before = evidenceCount();
    const res = await evidencePOST(multipart({ campaignId: SEED_DEMO_CAMPAIGN_ID, type: "x" }));
    expect(res.status).toBe(400);
    expect(evidenceCount()).toBe(before);
  });

  test("rejects a missing type label with 400", async () => {
    const res = await evidencePOST(
      multipart({ campaignId: SEED_DEMO_CAMPAIGN_ID, intakeKind: "url", url: "https://a.test" }),
    );
    expect(res.status).toBe(400);
  });

  test("rejects a non-http(s) url with 400", async () => {
    const res = await evidencePOST(
      multipart({
        campaignId: SEED_DEMO_CAMPAIGN_ID,
        intakeKind: "url",
        type: "link",
        url: "ftp://evil.test/x",
      }),
    );
    expect(res.status).toBe(400);
  });

  test("rejects an image intake with no file (400) and writes nothing", async () => {
    const before = evidenceCount();
    const res = await evidencePOST(
      multipart({ campaignId: SEED_DEMO_CAMPAIGN_ID, intakeKind: "image", type: "screenshot" }),
    );
    expect(res.status).toBe(400);
    expect(evidenceCount()).toBe(before);
  });

  test("rejects a disallowed file content-type with 400", async () => {
    const before = evidenceCount();
    const res = await evidencePOST(
      multipart(
        { campaignId: SEED_DEMO_CAMPAIGN_ID, intakeKind: "image", type: "screenshot" },
        { name: "x.pdf", type: "application/pdf", bytes: new Uint8Array([1, 2]) },
      ),
    );
    expect(res.status).toBe(400);
    expect(evidenceCount()).toBe(before);
  });
});

describe("POST /api/evidence — happy path + server-owned honesty fields", () => {
  test("ingests a url as a machine receipt (201); ignores any forged provenance fields", async () => {
    const res = await evidencePOST(
      multipart({
        campaignId: SEED_DEMO_CAMPAIGN_ID,
        intakeKind: "url",
        type: "Twitch VOD link",
        url: "https://twitch.tv/videos/9",
        // A malicious client tries to smuggle honesty fields — all ignored.
        machineOrHuman: "human",
        uploadedAt: "2000-01-01T00:00:00.000Z",
        dataOrigin: "real",
      }),
    );
    expect(res.status).toBe(201);
    const view = await res.json();
    expect(view.machineOrHuman).toBe("machine"); // derived from kind, not the body
    expect(view.uploadedAt).not.toBe("2000-01-01T00:00:00.000Z"); // server clock
    expect(view.dataOrigin).toBe("seeded"); // inherited from the demo campaign
    expect(view.url).toBe("https://twitch.tv/videos/9");
  });

  test("ingests an image through storage as a human receipt (201)", async () => {
    const res = await evidencePOST(
      multipart(
        { campaignId: SEED_DEMO_CAMPAIGN_ID, intakeKind: "image", type: "disclosure-screenshot" },
        { name: "shot.png", type: "image/png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
      ),
    );
    expect(res.status).toBe(201);
    const view = await res.json();
    expect(view.machineOrHuman).toBe("human");
    expect(view.storageKey).toContain(SEED_DEMO_CAMPAIGN_ID);
    expect(view.contentType).toBe("image/png");
  });

  test("a metric-screenshot is a human assertion, never machine (AD-19)", async () => {
    const res = await evidencePOST(
      multipart(
        { campaignId: SEED_DEMO_CAMPAIGN_ID, intakeKind: "metric", type: "metric-screenshot" },
        { name: "ccv.png", type: "image/png", bytes: new Uint8Array([1, 2, 3]) },
      ),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).machineOrHuman).toBe("human");
  });

  test("404 for an unknown campaign", async () => {
    const res = await evidencePOST(
      multipart({ campaignId: "no-such-campaign", intakeKind: "text", type: "note", note: "hi" }),
    );
    expect(res.status).toBe(404);
  });
});
