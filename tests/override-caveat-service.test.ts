// The override & caveat write orchestration (Story 1.9, AD-2/AD-6). These thin
// services sit between the Route Handlers and the repository: they persist the
// operator's decision and return the refreshed READ-ONLY Claim Card view in one
// round-trip. Invariants:
//   1. Setting/clearing an override or adding a caveat NEVER runs the audit —
//      no AuditResult is written by these paths (AD-6). The machine verdict is
//      only ever computed by the explicit "Run Proof Audit" action (Story 1.7).
//   2. The machine verdict stays pinned/visible under an override (AD-6).
//   3. `authoredBy` is whatever the shell resolved — persisted verbatim (AD-3).
//   4. A non-existent Claim yields null (the route maps that to 404).

import { beforeEach, describe, expect, test } from "vitest";
import { type SeedSummary, seedDemoCampaign } from "@/seed/demo-campaign";
import { createTestDb, type Db, type DbHandle, readAuditResult } from "@/src/repositories";
import {
  addClaimCaveat,
  clearClaimOverride,
  resolveEffectiveStatus,
  setClaimOverride,
} from "@/src/services";

let handle: DbHandle;
let db: Db;
let seed: SeedSummary;

function claimByVerdict(verdict: "green" | "yellow" | "red"): string {
  const found = seed.deliverables.find((d) => d.intendedVerdict === verdict);
  if (!found) throw new Error(`no seeded deliverable with intended verdict ${verdict}`);
  return found.claimId;
}

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
  seed = seedDemoCampaign(db);
});

describe("setClaimOverride (Story 1.9)", () => {
  test("overlays the override as the effective status while the machine verdict stays pinned", () => {
    const claimId = claimByVerdict("green");
    resolveEffectiveStatus(db, claimId, "2026-07-09T00:00:00.000Z");
    const view = setClaimOverride(db, { claimId, finalStatus: "red", authoredBy: "Farouk" });
    expect(view?.machineVerdict).toBe("green"); // never hidden (AD-6)
    expect(view?.overrideStatus).toBe("red");
    expect(view?.effectiveStatus).toBe("red");
  });

  test("works pre-audit too, but honestly reports no machine verdict to pin", () => {
    // Pre-audit there is no persisted verdict; an override still records, but the
    // card shows no machine verdict (the UI keeps the toggle inert pre-audit).
    const claimId = claimByVerdict("green");
    const view = setClaimOverride(db, { claimId, finalStatus: "yellow", authoredBy: "Farouk" });
    expect(view).not.toBeNull();
    expect(view?.machineVerdict).toBeNull();
  });

  test("NEVER writes an AuditResult (AD-6)", () => {
    const claimId = claimByVerdict("green");
    setClaimOverride(db, { claimId, finalStatus: "red", authoredBy: "Farouk" });
    expect(readAuditResult(db, claimId)).toBeUndefined();
  });

  test("returns null for a non-existent Claim (→ 404 at the route)", () => {
    expect(
      setClaimOverride(db, { claimId: "nope", finalStatus: "red", authoredBy: "x" }),
    ).toBeNull();
  });
});

describe("clearClaimOverride (Story 1.9 — the toggle OFF path)", () => {
  test("returns the effective status to the pure machine verdict", () => {
    const claimId = claimByVerdict("green");
    resolveEffectiveStatus(db, claimId, "2026-07-09T00:00:00.000Z");
    setClaimOverride(db, { claimId, finalStatus: "red", authoredBy: "Farouk" });
    const view = clearClaimOverride(db, claimId);
    expect(view?.overrideStatus).toBeNull();
    expect(view?.effectiveStatus).toBe("green");
  });

  test("returns null for a non-existent Claim", () => {
    expect(clearClaimOverride(db, "nope")).toBeNull();
  });
});

describe("addClaimCaveat (Story 1.9)", () => {
  test("appends a caveat and clears requiresCaveat on an effective-Yellow", () => {
    const claimId = claimByVerdict("yellow");
    resolveEffectiveStatus(db, claimId, "2026-07-09T00:00:00.000Z");
    const view = addClaimCaveat(db, {
      claimId,
      text: "Rests on the creator's word.",
      authoredBy: "Farouk",
    });
    expect(view?.caveats).toHaveLength(1);
    expect(view?.caveats[0].authoredBy).toBe("Farouk");
    expect(view?.requiresCaveat).toBe(false);
  });

  test("NEVER writes an AuditResult (AD-6)", () => {
    const claimId = claimByVerdict("yellow");
    addClaimCaveat(db, { claimId, text: "a caveat", authoredBy: "Farouk" });
    expect(readAuditResult(db, claimId)).toBeUndefined();
  });

  test("returns null for a non-existent Claim", () => {
    expect(addClaimCaveat(db, { claimId: "nope", text: "x", authoredBy: "y" })).toBeNull();
  });
});
