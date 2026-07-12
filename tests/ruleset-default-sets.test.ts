// Default critical/supporting Proof Requirement set per Deliverable type
// (AD-13, FR-9, PRD §14.5). Table tests pin membership, criticality, the
// required France/EU disclosure critical, and — after Story 3.3's closing
// GATE b/3 was retired (2026-07-12) — the HONEST per-requirement confirmation
// state. Confirmation is NOT blanket: the disclosure critical is confirmed
// (loi Influenceurs art. 5) and the proof-of-delivery structure is confirmed,
// but two unsourced placeholders were demoted to provisional with a stated note
// (Epic 3 retro AI-2). The invariant these tests enforce is that any
// `confirmed: false` requirement MUST carry a non-empty note — never a silent
// unconfirmed default. See src/ruleset/default-requirement-sets.ts for sourcing.

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

describe("HONEST confirmation state (Story 3.3 GATE b/3 retired 2026-07-12; Epic 3 retro AI-2)", () => {
  // Set-level `provisional` was retired at the 3-3 close; that stands. It means
  // the set was reviewed and adopted — NOT that every member is grounded.
  test.each(DELIVERABLE_TYPE)("%s set is adopted (set-level provisional=false)", (type) => {
    expect(defaultRequirementsFor(type).provisional).toBe(false);
  });

  // The disclosure critical is the one legally-sourced member (loi Influenceurs
  // art. 5, Légifrance JORFTEXT000047663185) — confirmed in every set.
  test.each(DELIVERABLE_TYPE)("%s disclosure-visible critical is confirmed", (type) => {
    const disclosure = defaultRequirementsFor(type).requirements.find(
      (r) => r.kind === "disclosure-visible",
    );
    expect(disclosure?.confirmed).toBe(true);
  });

  // THE load-bearing invariant (replaces the old "everything is confirmed=true"
  // rubber stamp): an unconfirmed default must say why. A `confirmed: false`
  // with no note is populated-and-guessed — the exact failure AI-2 outlawed.
  test("every unconfirmed requirement carries a non-empty note stating what's missing", () => {
    for (const type of DELIVERABLE_TYPE) {
      for (const req of defaultRequirementsFor(type).requirements) {
        if (req.confirmed === false) {
          expect(req.note && req.note.trim().length > 0).toBeTruthy();
        }
      }
    }
  });

  // Pin the two AI-2 demotions so a future regeneration off the epic cannot
  // silently re-confirm them (leaf/root split guard).
  test("C1: instagram-reel reach-screenshot is provisional and window-free", () => {
    const req = defaultRequirementsFor("instagram-reel").requirements.find(
      (r) => r.kind === "reach-screenshot",
    );
    expect(req?.confirmed).toBe(false);
    expect(req?.label).not.toMatch(/48/); // the unsourced "within 48h" window is gone
  });

  test("C2: twitch channel-match is provisional pending a stated rationale", () => {
    const req = defaultRequirementsFor("twitch-sponsor-segment").requirements.find(
      (r) => r.kind === "channel-match",
    );
    expect(req?.confirmed).toBe(false);
    expect(req?.note).toMatch(/rationale-or-removal/i);
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
