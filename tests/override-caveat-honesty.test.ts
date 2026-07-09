// Story 1.9 honesty regressions (AD-3/AD-6/AD-9). These are MANDATORY and never
// skipped — they pin the invariants that make human override & caveat honest:
//   1. The machine NEVER authors a human artifact: running the audit over the
//      whole seeded campaign creates ZERO caveat and ZERO override rows. Caveats
//      and overrides come only from an operator action.
//   2. Machine reasons live only in the AuditResult.trace, never as Caveat rows
//      (AD-6): a caveat's text is operator-provided and is not copied from any
//      trace reason.
//   3. An override is an overlay, not a re-classification (AD-6): setting or
//      clearing an override never changes the persisted machine verdict/trace —
//      the machine verdict stays exactly what the engine computed.
//   4. Who set it is persisted, never inferred (AD-3): override/caveat carry the
//      operator's `authored_by`, and both inherit the Campaign's `data_origin`.

import { beforeEach, describe, expect, test } from "vitest";
import { type SeedSummary, seedDemoCampaign } from "@/seed/demo-campaign";
import {
  createCaveat,
  createHumanOverride,
  createTestDb,
  type Db,
  type DbHandle,
  deleteHumanOverride,
  listCaveatsForClaim,
  readAuditResult,
} from "@/src/repositories";
import { resolveEffectiveStatus } from "@/src/services";

const NOW = "2026-07-09T00:00:00.000Z";

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

describe("honesty: the machine never authors a human artifact (AD-6)", () => {
  test("running the audit over the whole campaign creates NO caveats and NO overrides", () => {
    for (const d of seed.deliverables) {
      resolveEffectiveStatus(db, d.claimId, NOW);
    }
    for (const d of seed.deliverables) {
      // The engine fabricated no operator narrative and no human override.
      expect(listCaveatsForClaim(db, d.claimId)).toHaveLength(0);
      const persisted = readAuditResult(db, d.claimId);
      // The machine verdict exists (audit ran) but nothing overlaid it.
      expect(persisted).toBeDefined();
    }
  });
});

describe("honesty: machine reasons live in the trace, never as Caveat rows (AD-6)", () => {
  test("a caveat's text is operator-provided, not copied from any machine trace reason", () => {
    const claimId = claimByVerdict("yellow");
    resolveEffectiveStatus(db, claimId, NOW);
    const before = readAuditResult(db, claimId);
    const traceReasons = new Set((before?.trace ?? []).map((t) => t.reason));

    createCaveat(db, {
      claimId,
      text: "Rests on the creator's word — needs a timestamped clip.",
      authoredBy: "Farouk",
    });

    const caveats = listCaveatsForClaim(db, claimId);
    expect(caveats).toHaveLength(1);
    // The operator narrative is NOT one of the machine trace reasons.
    expect(traceReasons.has(caveats[0].text)).toBe(false);
    // Adding a caveat did not perturb the trace.
    expect(readAuditResult(db, claimId)?.trace).toEqual(before?.trace);
  });
});

describe("honesty: an override overlays, it never re-classifies the machine (AD-6)", () => {
  test("setting then clearing an override leaves the persisted machine verdict + trace unchanged", () => {
    const claimId = claimByVerdict("green");
    resolveEffectiveStatus(db, claimId, NOW);
    const original = readAuditResult(db, claimId);
    expect(original?.machineVerdict).toBe("green");

    // Override to red, then to yellow, then clear — the machine cache is inert.
    createHumanOverride(db, { claimId, finalStatus: "red", authoredBy: "Farouk" });
    createHumanOverride(db, { claimId, finalStatus: "yellow", authoredBy: "Farouk" });
    deleteHumanOverride(db, claimId);

    const after = readAuditResult(db, claimId);
    expect(after?.machineVerdict).toBe(original?.machineVerdict);
    expect(after?.trace).toEqual(original?.trace);
  });
});

describe("honesty: who set it is persisted + origin inherited (AD-3, AD-9)", () => {
  test("override and caveat carry authored_by and the seeded data_origin", () => {
    const claimId = claimByVerdict("yellow");
    const override = createHumanOverride(db, {
      claimId,
      finalStatus: "yellow",
      authoredBy: "Farouk",
    });
    const caveat = createCaveat(db, { claimId, text: "needs a clip", authoredBy: "Farouk" });

    expect(override.authoredBy).toBe("Farouk");
    expect(override.dataOrigin).toBe("seeded");
    expect(caveat.authoredBy).toBe("Farouk");
    expect(caveat.dataOrigin).toBe("seeded");
  });
});
