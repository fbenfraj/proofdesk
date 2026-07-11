// Default critical/supporting Proof Requirement set per Deliverable type
// (AD-13, FR-9, PRD §14.5). Table tests pin membership, criticality, the
// required France/EU disclosure critical, and — load-bearing for Story 3.3's
// closing GATE b/3 — that every set is PROVISIONAL and every requirement is
// unconfirmed until validated against real platform rules.

import { describe, expect, test } from "vitest";
import {
  DEFAULT_REQUIREMENT_SETS,
  DELIVERABLE_TYPE,
  type DeliverableType,
  defaultRequirementsFor,
} from "@/src/ruleset";

/** Expected shape per type: kinds present + their criticality. Derived verbatim
 *  from epics.md#Story 3.1 (lines 630-638); nothing added to "look complete". */
const EXPECTED: Record<DeliverableType, { critical: string[]; supporting: string[] }> = {
  "twitch-sponsor-segment": {
    critical: ["proof-of-posting", "segment-timestamp-field", "disclosure-visible"],
    supporting: ["viewer-figure", "channel-match", "reach-screenshot"],
  },
  "instagram-story": {
    critical: ["durable-capture", "disclosure-visible"],
    supporting: ["reach-screenshot"],
  },
  "instagram-reel": {
    critical: ["proof-of-posting", "disclosure-visible"],
    supporting: ["reach-screenshot"],
  },
  tiktok: {
    critical: ["proof-of-posting", "disclosure-visible"],
    supporting: ["metric-screenshot"],
  },
  "youtube-integration": {
    critical: ["proof-of-posting", "segment-timestamp-field", "disclosure-visible"],
    supporting: ["viewer-figure"],
  },
};

describe("default requirement sets — membership & criticality", () => {
  test.each(DELIVERABLE_TYPE)("%s has the expected critical + supporting members", (type) => {
    const set = defaultRequirementsFor(type);
    const critical = set.requirements
      .filter((r) => r.criticality === "critical")
      .map((r) => r.kind);
    const supporting = set.requirements
      .filter((r) => r.criticality === "supporting")
      .map((r) => r.kind);
    expect(critical).toEqual(EXPECTED[type].critical);
    expect(supporting).toEqual(EXPECTED[type].supporting);
  });

  test.each(
    DELIVERABLE_TYPE,
  )("%s includes the required France/EU disclosure as CRITICAL", (type) => {
    const disclosure = defaultRequirementsFor(type).requirements.find(
      (r) => r.kind === "disclosure-visible",
    );
    expect(disclosure).toBeDefined();
    expect(disclosure?.criticality).toBe("critical");
  });
});

describe("PROVISIONAL honesty (Story 3.3 GATE b/3)", () => {
  test.each(DELIVERABLE_TYPE)("%s set is provisional", (type) => {
    expect(defaultRequirementsFor(type).provisional).toBe(true);
  });

  test.each(DELIVERABLE_TYPE)("every requirement in %s ships confirmed=false", (type) => {
    for (const req of defaultRequirementsFor(type).requirements) {
      expect(req.confirmed).toBe(false);
    }
    // No confirmed requirement anywhere — the whole surface is unconfirmed.
    const anyConfirmed = defaultRequirementsFor(type).requirements.some(
      (r) => r.confirmed !== false,
    );
    expect(anyConfirmed).toBe(false);
  });

  test.each(DELIVERABLE_TYPE)("%s carries a non-empty English label per requirement", (type) => {
    for (const req of defaultRequirementsFor(type).requirements) {
      expect(req.label.length).toBeGreaterThan(0);
    }
  });
});

describe("registry completeness", () => {
  test("exactly the five enumerated Deliverable types ship a default set", () => {
    expect(Object.keys(DEFAULT_REQUIREMENT_SETS).sort()).toEqual([...DELIVERABLE_TYPE].sort());
  });

  test("each set's deliverableType field matches its key", () => {
    for (const type of DELIVERABLE_TYPE) {
      expect(DEFAULT_REQUIREMENT_SETS[type].deliverableType).toBe(type);
    }
  });
});
