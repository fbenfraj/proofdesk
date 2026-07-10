// The liveness endpoint + its service (Story 2.4, AD-2/AD-8). Two layers:
//   1. `runEvidenceLiveness` (service) — offline via injected `resolve`/`request`
//      deps: it persists the four-value label + audit trail and returns the view,
//      and 404-signals (null) for a non-link item or an unknown id.
//   2. `POST /api/evidence/[id]/liveness` (Route Handler) — the shell contract:
//      a bad param is 400, an unknown/non-link item is 404. The happy path is
//      exercised at the service layer (the route uses the real adapter, which the
//      unit suite must not send over the network — AD-10).

import { afterAll, beforeAll, describe, expect, test } from "vitest";

process.env.DB_PATH = ":memory:";

import { POST as livenessPOST } from "@/app/api/evidence/[evidenceItemId]/liveness/route";
import {
  createCampaign,
  createClient,
  createEvidenceItem,
  getDb,
  getEvidenceItem,
  runMigrations,
} from "@/src/repositories";
import { runEvidenceLiveness } from "@/src/services";

let campaignId: string;

beforeAll(() => {
  const handle = getDb();
  runMigrations(handle);
  const client = createClient(handle.db, "Acme");
  campaignId = createCampaign(handle.db, {
    clientId: client.id,
    name: "Real Campaign",
    dataOrigin: "real",
    isDemo: false,
  }).id;
});

afterAll(() => {
  getDb().sqlite.close();
});

function newUrlItem(url: string): string {
  return createEvidenceItem(getDb().db, {
    campaignId,
    type: "link",
    machineOrHuman: "machine",
    intakeKind: "url",
    url,
    uploadedAt: "2026-06-01T00:00:00.000Z",
  }).id;
}

const offlineLive = {
  resolve: async () => ["93.184.216.34"],
  request: async () => ({ status: 200, location: null }),
  now: () => "2026-07-10T12:00:00.000Z",
};

describe("runEvidenceLiveness (service, offline)", () => {
  test("checks a link item, persists the label + audit trail, returns the view", async () => {
    const id = newUrlItem("https://example.com/post");
    const view = await runEvidenceLiveness(getDb().db, id, offlineLive);

    expect(view).toMatchObject({
      evidenceItemId: id,
      label: "live",
      status: "200",
      reason: "http-200",
      checkedAt: "2026-07-10T12:00:00.000Z",
    });

    const row = getEvidenceItem(getDb().db, id);
    expect(row?.livenessLabel).toBe("live");
    expect(row?.livenessStatus).toBe("200");
    expect(row?.livenessCheckedAt).toBe("2026-07-10T12:00:00.000Z");
  });

  test("a non-link (image) item resolves to null → 404 upstream", async () => {
    const imageId = createEvidenceItem(getDb().db, {
      campaignId,
      type: "screenshot",
      machineOrHuman: "human",
      intakeKind: "image",
      storageKey: "k",
      contentType: "image/png",
      originalFilename: "x.png",
      uploadedAt: "2026-06-01T00:00:00.000Z",
    }).id;
    expect(await runEvidenceLiveness(getDb().db, imageId, offlineLive)).toBeNull();
  });

  test("an unknown id resolves to null", async () => {
    expect(await runEvidenceLiveness(getDb().db, "nope", offlineLive)).toBeNull();
  });
});

describe("POST /api/evidence/[id]/liveness (route shell contract)", () => {
  test("an unknown item id is a clean 404", async () => {
    const res = await livenessPOST(new Request("http://test.local", { method: "POST" }), {
      params: Promise.resolve({ evidenceItemId: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });

  test("an empty id param is a 400", async () => {
    const res = await livenessPOST(new Request("http://test.local", { method: "POST" }), {
      params: Promise.resolve({ evidenceItemId: "" }),
    });
    expect(res.status).toBe(400);
  });
});
