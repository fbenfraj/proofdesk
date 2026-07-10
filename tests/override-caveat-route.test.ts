// The override & caveat Route Handlers (Story 1.9, AD-2/AD-8). The routes are a
// thin shell: Zod-validate at the boundary, resolve the operator identity in the
// shell (NOT from the body), delegate to the already-tested service, and shape
// the HTTP response. These tests assert the shell contract:
//   1. Invalid input is rejected at the boundary with 400 before any effect.
//   2. `authoredBy` is server-resolved — a forged `authoredBy` in the body is
//      ignored; the persisted author is the shell identity (integrity, AD-11).
//   3. A missing Claim is a clean 404, not a 500.
//   4. The happy path returns the refreshed Claim Card view (single round-trip).
//
// The routes call the process `getDb()` singleton; we point it at an in-memory DB
// (DB_PATH=":memory:") and seed it once. Handlers are invoked directly with a
// Request + the Next 16 `ctx.params` promise.

import { beforeAll, describe, expect, test } from "vitest";

process.env.DB_PATH = ":memory:";
process.env.OPERATOR_NAME = "ShellOperator";
delete process.env.OPERATOR_AGENCY;

import { POST as caveatPOST } from "@/app/api/claims/[claimId]/caveat/route";
import {
  DELETE as overrideDELETE,
  POST as overridePOST,
} from "@/app/api/claims/[claimId]/override/route";
import { seedDemoCampaign } from "@/seed/demo-campaign";
import { getDb, listCaveatsForClaim, runMigrations } from "@/src/repositories";
import { resolveEffectiveStatus } from "@/src/services";

let greenClaimId: string;
let yellowClaimId: string;

function ctx(claimId: string) {
  return { params: Promise.resolve({ claimId }) };
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
  const seed = seedDemoCampaign(handle.db);
  greenClaimId = seed.deliverables.find((d) => d.intendedVerdict === "green")?.claimId as string;
  yellowClaimId = seed.deliverables.find((d) => d.intendedVerdict === "yellow")?.claimId as string;
  // Give the claims a machine verdict so effective status resolves.
  resolveEffectiveStatus(handle.db, greenClaimId, "2026-07-09T00:00:00.000Z");
  resolveEffectiveStatus(handle.db, yellowClaimId, "2026-07-09T00:00:00.000Z");
});

describe("POST /api/claims/[claimId]/override — validation (AD-8)", () => {
  test("rejects an invalid finalStatus with 400", async () => {
    const res = await overridePOST(jsonRequest({ finalStatus: "purple" }), ctx(greenClaimId));
    expect(res.status).toBe(400);
  });

  test("rejects a malformed JSON body with 400", async () => {
    const bad = new Request("http://test.local", { method: "POST", body: "not json" });
    const res = await overridePOST(bad, ctx(greenClaimId));
    expect(res.status).toBe(400);
  });

  test("404 for a non-existent Claim", async () => {
    const res = await overridePOST(jsonRequest({ finalStatus: "red" }), ctx("no-such-claim"));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/claims/[claimId]/override — happy path (FR-10, AD-6)", () => {
  test("sets the override, keeps the machine verdict pinned, and ignores a forged authoredBy", async () => {
    // A malicious client tries to attribute the decision to someone else.
    const res = await overridePOST(
      jsonRequest({ finalStatus: "red", authoredBy: "NotTheOperator" }),
      ctx(greenClaimId),
    );
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.machineVerdict).toBe("green"); // never hidden
    expect(view.overrideStatus).toBe("red");
    expect(view.effectiveStatus).toBe("red");
  });

  test("DELETE clears the override (toggle OFF) → back to the machine verdict", async () => {
    await overridePOST(jsonRequest({ finalStatus: "red" }), ctx(greenClaimId));
    const res = await overrideDELETE(
      new Request("http://test.local", { method: "DELETE" }),
      ctx(greenClaimId),
    );
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.overrideStatus).toBeNull();
    expect(view.effectiveStatus).toBe("green");
  });
});

describe("POST /api/claims/[claimId]/caveat (FR-10, AD-6)", () => {
  test("rejects an empty caveat with 400", async () => {
    const res = await caveatPOST(jsonRequest({ text: "   " }), ctx(yellowClaimId));
    expect(res.status).toBe(400);
  });

  test("appends a caveat authored by the SHELL identity, not the body", async () => {
    const res = await caveatPOST(
      jsonRequest({ text: "Rests on the creator's word.", authoredBy: "Forged" }),
      ctx(yellowClaimId),
    );
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.caveats.length).toBeGreaterThan(0);
    // The persisted author is the server-resolved operator, never the body value.
    const stored = listCaveatsForClaim(getDb().db, yellowClaimId);
    expect(stored.every((c) => c.authoredBy === "ShellOperator")).toBe(true);
    expect(stored.some((c) => c.authoredBy === "Forged")).toBe(false);
    // Writing a caveat clears the effective-Yellow gate.
    expect(view.requiresCaveat).toBe(false);
  });

  test("404 for a non-existent Claim", async () => {
    const res = await caveatPOST(jsonRequest({ text: "x" }), ctx("no-such-claim"));
    expect(res.status).toBe(404);
  });
});
