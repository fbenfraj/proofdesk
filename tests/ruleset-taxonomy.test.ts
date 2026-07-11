// Satisfaction taxonomy — the rule that assigns machine_or_human (AD-19). The
// honesty core: an unverifiable figure (viewer/CCV, view, reach, metric,
// screenshot, durable capture) is ALWAYS a Human assertion, never machine. Only
// a checkable link is machine, and only for reachability (AD-5). A structured
// field is machine present/absent, never content-verified.

import { describe, expect, test } from "vitest";
import {
  DEFAULT_REQUIREMENT_SETS,
  DEFAULT_SATISFACTION_TYPE,
  RULESET_VERSION,
  type SatisfactionType,
  satisfactionTypeOf,
} from "@/src/ruleset";

describe("satisfaction taxonomy: unverifiable evidence is always a Human assertion (AD-19)", () => {
  test.each<[string, SatisfactionType]>([
    // The viewer/CCV figure is operator-entered and ALWAYS a Human assertion,
    // never machine-verified (AD-19, PRD §6). This is the load-bearing assertion.
    ["viewer-figure", "human-assertion"],
    ["reach-screenshot", "human-assertion"],
    ["metric-screenshot", "human-assertion"],
    ["durable-capture", "human-assertion"],
    ["channel-match", "human-assertion"],
    ["reach-metric", "human-assertion"],
    ["segment-timestamp", "human-assertion"],
    // Only a checkable link is machine (reachability only, AD-5).
    ["proof-of-posting", "link-reachability"],
    // Structured field — machine present/absent, not content verification.
    ["segment-timestamp-field", "structured-field"],
    // Disclosure is its own three-tier dimension (AD-13).
    ["disclosure-visible", "disclosure"],
  ])("kind %s → %s", (kind, expected) => {
    expect(satisfactionTypeOf(kind)).toBe(expected);
  });

  test("an unknown kind falls back to the honesty default (human-assertion)", () => {
    expect(DEFAULT_SATISFACTION_TYPE).toBe("human-assertion");
    expect(satisfactionTypeOf("some-kind-invented-later")).toBe("human-assertion");
    expect(satisfactionTypeOf("")).toBe("human-assertion");
  });
});

describe("taxonomy changes are version-locked to RULESET_VERSION (AD-13, AD-4)", () => {
  // The kind → satisfaction-type mapping is verdict-determining IP applied inside
  // the pure core; it is NOT part of the evidence-snapshot hash, so RULESET_VERSION
  // is the ONLY guard that invalidates AuditResult caches when it changes. This
  // snapshot pins the full known mapping together with the version: if you edit the
  // taxonomy, this test fails until you ALSO bump RULESET_VERSION and update the map
  // here — the coupling that keeps a taxonomy change from silently reusing a stale
  // cached verdict.
  test("the known kind→type map matches the version it shipped under", () => {
    const KNOWN_KINDS = [
      "proof-of-posting",
      "disclosure-visible",
      "reach-metric",
      "segment-timestamp",
      "segment-timestamp-field",
      "durable-capture",
      "viewer-figure",
      "channel-match",
      "reach-screenshot",
      "metric-screenshot",
    ] as const;
    const snapshot = Object.fromEntries(KNOWN_KINDS.map((k) => [k, satisfactionTypeOf(k)]));
    expect({ RULESET_VERSION, taxonomy: snapshot }).toEqual({
      RULESET_VERSION: "2",
      taxonomy: {
        "proof-of-posting": "link-reachability",
        "disclosure-visible": "disclosure",
        "reach-metric": "human-assertion",
        "segment-timestamp": "human-assertion",
        "segment-timestamp-field": "structured-field",
        "durable-capture": "human-assertion",
        "viewer-figure": "human-assertion",
        "channel-match": "human-assertion",
        "reach-screenshot": "human-assertion",
        "metric-screenshot": "human-assertion",
      },
    });
  });
});

describe("no default-set figure kind can silently claim machine verification", () => {
  // Every kind used by a default set must resolve to a taxonomy type that is
  // NOT machine UNLESS it is a genuine link (proof-of-posting) or a structured
  // present/absent field. This locks the source: a future edit that maps a
  // screenshot/figure kind to link-reachability would fail here.
  const MACHINE_ELIGIBLE_KINDS = new Set(["proof-of-posting", "segment-timestamp-field"]);

  test("figure/capture kinds never map to a machine-checked satisfaction type", () => {
    for (const set of Object.values(DEFAULT_REQUIREMENT_SETS)) {
      for (const req of set.requirements) {
        if (MACHINE_ELIGIBLE_KINDS.has(req.kind)) continue;
        const type = satisfactionTypeOf(req.kind);
        // disclosure + human-assertion are the only non-machine outcomes; a
        // figure kind resolving to link-reachability/structured-field is a bug.
        expect(["human-assertion", "disclosure"]).toContain(type);
      }
    }
  });
});
