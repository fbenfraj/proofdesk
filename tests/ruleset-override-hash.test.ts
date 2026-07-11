// Per-campaign override seam (AD-13) + its cache-invalidation guarantee (AD-4).
// The override object is hashed into the AuditResult identity tuple
// (`campaign_override_hash`) by the SAME `hashObject` the resolver uses, so this
// proves that an override EDIT changes the identity and invalidates the affected
// Claim's cache. Also covers the pure fold `applyCampaignOverrides`.

import { describe, expect, test } from "vitest";
import {
  applyCampaignOverrides,
  type CampaignRulesetOverride,
  canonicalizeCampaignOverride,
  type DefaultProofRequirement,
  defaultRequirementsFor,
  resolveCampaignRulesetOverrides,
} from "@/src/ruleset";
import { hashObject } from "@/src/services/hash";

const EMPTY: CampaignRulesetOverride = {};

/** The identity-path hash exactly as `src/services/audit.ts` computes it. */
const identityHash = (o: CampaignRulesetOverride) => hashObject(canonicalizeCampaignOverride(o));

describe("override hash feeds the AuditResult identity tuple (AD-4)", () => {
  test("no override today — resolveCampaignRulesetOverrides is empty and hashes like {}", () => {
    expect(resolveCampaignRulesetOverrides("any-campaign")).toEqual({});
    expect(identityHash(resolveCampaignRulesetOverrides("any-campaign"))).toBe(identityHash(EMPTY));
    // canonicalize({}) is still {} — existing AuditResult caches stay valid.
    expect(canonicalizeCampaignOverride(EMPTY)).toEqual({});
  });

  test("a non-empty override hashes differently from no override → cache miss", () => {
    const override: CampaignRulesetOverride = { criticality: { "reach-screenshot": "critical" } };
    expect(hashObject(override)).not.toBe(hashObject(EMPTY));
  });

  test("two distinct overrides hash differently → editing an override invalidates the cache", () => {
    const a: CampaignRulesetOverride = { criticality: { "reach-screenshot": "critical" } };
    const b: CampaignRulesetOverride = { removed: ["reach-screenshot"] };
    const c: CampaignRulesetOverride = { criticality: { "viewer-figure": "critical" } };
    const hashes = new Set([
      identityHash(a),
      identityHash(b),
      identityHash(c),
      identityHash(EMPTY),
    ]);
    expect(hashes.size).toBe(4);
  });

  test("reordered-but-identical overrides hash the SAME (no spurious cache miss)", () => {
    // criticality is a map + removed is a Set — both order-independent, so a
    // re-save in a different order must NOT invalidate the cache.
    const one: CampaignRulesetOverride = {
      criticality: { "reach-screenshot": "critical", "viewer-figure": "supporting" },
      removed: ["channel-match", "metric-screenshot"],
    };
    const reordered: CampaignRulesetOverride = {
      removed: ["metric-screenshot", "channel-match"],
      criticality: { "viewer-figure": "supporting", "reach-screenshot": "critical" },
    };
    expect(identityHash(one)).toBe(identityHash(reordered));
    // A genuinely different override still diverges.
    const changed: CampaignRulesetOverride = {
      criticality: { "reach-screenshot": "supporting", "viewer-figure": "supporting" },
      removed: ["channel-match", "metric-screenshot"],
    };
    expect(identityHash(one)).not.toBe(identityHash(changed));
  });

  test("added requirements hash order-independently (verdict is set-based)", () => {
    const r1: DefaultProofRequirement = {
      kind: "reach-metric",
      criticality: "supporting",
      label: "A",
      confirmed: false,
    };
    const r2: DefaultProofRequirement = {
      kind: "channel-match",
      criticality: "supporting",
      label: "B",
      confirmed: false,
    };
    expect(identityHash({ added: [r1, r2] })).toBe(identityHash({ added: [r2, r1] }));
  });
});

describe("applyCampaignOverrides — the pure fold (AD-13)", () => {
  const base = defaultRequirementsFor("twitch-sponsor-segment").requirements;

  test("empty override is a no-op (returns the default set unchanged)", () => {
    expect(applyCampaignOverrides(base, EMPTY)).toEqual(base);
  });

  test("re-classifies a requirement's criticality without touching the rest", () => {
    const out = applyCampaignOverrides(base, { criticality: { "reach-screenshot": "critical" } });
    expect(out.find((r) => r.kind === "reach-screenshot")?.criticality).toBe("critical");
    // Unrelated requirements are untouched.
    expect(out.find((r) => r.kind === "proof-of-posting")?.criticality).toBe("critical");
    expect(out).toHaveLength(base.length);
  });

  test("removes a requirement from the effective set", () => {
    const out = applyCampaignOverrides(base, { removed: ["channel-match"] });
    expect(out.some((r) => r.kind === "channel-match")).toBe(false);
    expect(out).toHaveLength(base.length - 1);
  });

  test("appends an added requirement", () => {
    const extra: DefaultProofRequirement = {
      kind: "reach-metric",
      criticality: "supporting",
      label: "Custom reach note",
      confirmed: false,
    };
    const out = applyCampaignOverrides(base, { added: [extra] });
    expect(out).toHaveLength(base.length + 1);
    expect(out[out.length - 1]).toEqual(extra);
  });

  test("does not mutate its inputs", () => {
    const snapshot = JSON.stringify(base);
    applyCampaignOverrides(base, {
      criticality: { "reach-screenshot": "critical" },
      removed: ["channel-match"],
    });
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});
