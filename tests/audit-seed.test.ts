// The magic moment, end to end (AC-5). The REAL audit engine, run over the
// seeded demo campaign (Story 1.4), must deterministically produce
// 9/9 claimed → 7 Green · 1 Yellow · 1 Red. The verdict is computed here, never
// read from the seed's documented `intendedVerdict`.

import { beforeEach, describe, expect, test } from "vitest";
import { type SeedSummary, seedDemoCampaign } from "@/seed/demo-campaign";
import { createTestDb, type Db, type DbHandle } from "@/src/repositories";
import type { ProofStatus } from "@/src/schema";
import { resolveEffectiveStatus } from "@/src/services";

let handle: DbHandle;
let db: Db;
let summary: SeedSummary;

const NOW = "2026-07-09T00:00:00.000Z";

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
  summary = seedDemoCampaign(db);
});

/** Resolve the machine verdict for every seeded Deliverable's Claim. */
function verdicts(): Record<string, ProofStatus> {
  const out: Record<string, ProofStatus> = {};
  for (const d of summary.deliverables) {
    out[d.key] = resolveEffectiveStatus(db, d.claimId, NOW).machineVerdict;
  }
  return out;
}

describe("magic-moment demo — the real engine over seeded inputs (AC-5)", () => {
  test("9 claimed → 7 Green · 1 Yellow · 1 Red", () => {
    const tally = { green: 0, yellow: 0, red: 0 };
    for (const status of Object.values(verdicts())) tally[status] += 1;
    expect(tally).toEqual({ green: 7, yellow: 1, red: 1 });
  });

  test("the specific narrative verdicts land where the seed intends", () => {
    const v = verdicts();
    expect(v.D4).toBe("yellow"); // EmberPlays Twitch — rests on the creator's word
    expect(v.D8).toBe("red"); // Camille Dubois IG Story — expired, nothing captured
    const greens = Object.entries(v)
      .filter(([, s]) => s === "green")
      .map(([k]) => k)
      .sort();
    expect(greens).toEqual(["D1", "D2", "D3", "D5", "D6", "D7", "D9"]);
  });

  test("the engine matches every documented design intent (verdict computed, not seeded)", () => {
    const v = verdicts();
    for (const d of summary.deliverables) {
      expect(v[d.key]).toBe(d.intendedVerdict);
    }
  });

  test("determinism: resolving the whole campaign twice yields the same verdicts", () => {
    const first = verdicts();
    const second = verdicts();
    expect(first).toEqual(second);
  });
});
