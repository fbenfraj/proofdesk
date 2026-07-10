// The override & caveat repository verbs Story 1.9 adds on top of the existing
// override-caveat schema (Story 1.3). Invariants under test:
//   1. `deleteHumanOverride` clears the 0..1 override so the toggle can turn OFF
//      — after it, the resolver falls back to the pure machine verdict (AD-6).
//   2. `createHumanOverride` still upserts (0..1 per Claim) and its `final_status`
//      overlays the machine verdict.
//   3. `listCaveatsForClaim` returns every appended caveat (append-only, 1..*),
//      each carrying its `authored_by` + inherited `data_origin` (AD-9).
//   4. Setting/clearing an override or appending a caveat NEVER writes an
//      AuditResult — override/caveat are overlays, never a recompute (AD-6).

import { beforeEach, describe, expect, test } from "vitest";
import { type SeedSummary, seedDemoCampaign } from "@/seed/demo-campaign";
import {
  createCaveat,
  createHumanOverride,
  createTestDb,
  type Db,
  type DbHandle,
  deleteHumanOverride,
  getHumanOverride,
  listCaveatsForClaim,
  readAuditResult,
} from "@/src/repositories";

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

describe("deleteHumanOverride (Story 1.9 — the toggle OFF path)", () => {
  test("removes the 0..1 override so the machine verdict stands again", () => {
    const claimId = claimByVerdict("green");
    createHumanOverride(db, { claimId, finalStatus: "red", authoredBy: "Farouk" });
    expect(getHumanOverride(db, claimId)?.finalStatus).toBe("red");

    deleteHumanOverride(db, claimId);
    expect(getHumanOverride(db, claimId)).toBeUndefined();
  });

  test("is idempotent — deleting when none is set is a no-op", () => {
    const claimId = claimByVerdict("green");
    expect(() => deleteHumanOverride(db, claimId)).not.toThrow();
    expect(getHumanOverride(db, claimId)).toBeUndefined();
  });

  test("never writes an AuditResult (override is an overlay, not a recompute, AD-6)", () => {
    const claimId = claimByVerdict("green");
    createHumanOverride(db, { claimId, finalStatus: "yellow", authoredBy: "Farouk" });
    deleteHumanOverride(db, claimId);
    expect(readAuditResult(db, claimId)).toBeUndefined();
  });
});

describe("createHumanOverride upsert (0..1 per Claim, AD-6)", () => {
  test("a second override replaces the first (operator changes their mind)", () => {
    const claimId = claimByVerdict("green");
    createHumanOverride(db, { claimId, finalStatus: "red", authoredBy: "Farouk" });
    createHumanOverride(db, { claimId, finalStatus: "yellow", authoredBy: "Farouk" });
    const override = getHumanOverride(db, claimId);
    expect(override?.finalStatus).toBe("yellow");
    expect(listCaveatsForClaim(db, claimId)).toBeInstanceOf(Array); // unaffected
  });

  test("inherits data_origin from the (seeded) Campaign, never client-set (AD-9)", () => {
    const claimId = claimByVerdict("green");
    const override = createHumanOverride(db, { claimId, finalStatus: "red", authoredBy: "Farouk" });
    expect(override.dataOrigin).toBe("seeded");
  });
});

describe("listCaveatsForClaim (Story 1.9 — append-only, 1..*)", () => {
  test("returns every appended caveat with its author + inherited origin", () => {
    const claimId = claimByVerdict("yellow");
    expect(listCaveatsForClaim(db, claimId)).toHaveLength(0);

    createCaveat(db, { claimId, text: "Rests on the creator's word.", authoredBy: "Farouk" });
    createCaveat(db, { claimId, text: "Needs a timestamped clip.", authoredBy: "Farouk" });

    const caveats = listCaveatsForClaim(db, claimId);
    expect(caveats).toHaveLength(2);
    expect(caveats.map((c) => c.text).sort()).toEqual([
      "Needs a timestamped clip.",
      "Rests on the creator's word.",
    ]);
    for (const c of caveats) {
      expect(c.authoredBy).toBe("Farouk");
      expect(c.dataOrigin).toBe("seeded");
    }
  });

  test("is claim-scoped — a caveat on one claim never leaks to another", () => {
    const yellow = claimByVerdict("yellow");
    const green = claimByVerdict("green");
    createCaveat(db, { claimId: yellow, text: "only on yellow", authoredBy: "Farouk" });
    expect(listCaveatsForClaim(db, green)).toHaveLength(0);
  });

  test("appending a caveat never writes an AuditResult (AD-6)", () => {
    const claimId = claimByVerdict("yellow");
    createCaveat(db, { claimId, text: "a caveat", authoredBy: "Farouk" });
    expect(readAuditResult(db, claimId)).toBeUndefined();
  });
});
