// The deterministic Evidence→Deliverable matcher (Story 2.2, FR-6, AD-17). This
// is the PURE core of matching — no DB, no HTTP. The honesty bar: it resolves to
// exactly ONE Deliverable or Unassigned, by owned URL/handle rules, and NEVER
// produces a confidence score or ranking (AD-17). These table tests pin that.

import { describe, expect, test } from "vitest";
import { type MatchCandidate, matchEvidence, normaliseUrl } from "@/src/services";

// PixelForge owns two Deliverables (d1, d3) → a handle-only match is ambiguous.
// NovaStream owns exactly one (d2) → a handle-only match resolves.
const CANDIDATES: MatchCandidate[] = [
  {
    deliverableId: "d1",
    creatorName: "PixelForge",
    creatorHandle: "pixelforge",
    deliverableType: "Twitch sponsor segment",
    platformUrl: "https://twitch.tv/pixelforge/segment-aurora",
  },
  {
    deliverableId: "d3",
    creatorName: "PixelForge",
    creatorHandle: "pixelforge",
    deliverableType: "Twitch highlight clip",
    platformUrl: "https://twitch.tv/pixelforge/clip/aurora-highlight",
  },
  {
    deliverableId: "d2",
    creatorName: "NovaStream",
    creatorHandle: "novastream",
    deliverableType: "Twitch sponsor segment",
    platformUrl: "https://twitch.tv/novastream/segment-aurora",
  },
];

describe("matchEvidence — deterministic, exactly-one-or-unassigned (FR-6)", () => {
  test.each([
    // [name, url, note, expectedDeliverableId | null, expectedRulePrefix]
    [
      "platform URL sub-path → the one Deliverable",
      "https://twitch.tv/pixelforge/segment-aurora/vod/123",
      null,
      "d1",
      "url:",
    ],
    [
      "platform URL with www + exact → the one Deliverable",
      "https://www.twitch.tv/novastream/segment-aurora",
      null,
      "d2",
      "url:",
    ],
    [
      "known handle mapping to exactly one Deliverable (note)",
      null,
      "shoutout — great work @novastream tonight",
      "d2",
      "handle:",
    ],
    [
      "handle whose creator owns several Deliverables → Unassigned",
      null,
      "new clip from pixelforge is up",
      null,
      null,
    ],
    ["no rule matches → Unassigned", "https://example.com/whatever", null, null, null],
    ["empty evidence → Unassigned", null, null, null, null],
  ])("%s", (_name, url, note, expectedId, rulePrefix) => {
    const out = matchEvidence({ url, note }, CANDIDATES);
    if (expectedId === null) {
      expect(out.matched).toBe(false);
    } else {
      expect(out.matched).toBe(true);
      if (out.matched) {
        expect(out.deliverableId).toBe(expectedId);
        expect(out.rule.startsWith(rulePrefix as string)).toBe(true);
      }
    }
  });

  test("URL rule takes precedence over an ambiguous handle (specific wins, not a rank)", () => {
    // The URL identifies d1 unambiguously even though the pixelforge handle is
    // ambiguous — precedence, never a likelihood score.
    const out = matchEvidence(
      { url: "https://twitch.tv/pixelforge/segment-aurora", note: "from pixelforge" },
      CANDIDATES,
    );
    expect(out).toEqual({
      matched: true,
      deliverableId: "d1",
      rule: "url:twitch.tv/pixelforge/segment-aurora",
    });
  });

  test("an ambiguous URL (two Deliverables share a platform URL) → Unassigned, never a guess", () => {
    const ambiguous: MatchCandidate[] = [
      {
        deliverableId: "a",
        creatorName: "A",
        creatorHandle: null,
        deliverableType: "t",
        platformUrl: "https://x.test/p",
      },
      {
        deliverableId: "b",
        creatorName: "B",
        creatorHandle: null,
        deliverableType: "t",
        platformUrl: "https://x.test/p",
      },
    ];
    expect(matchEvidence({ url: "https://x.test/p", note: null }, ambiguous).matched).toBe(false);
  });

  test("handle is token-bounded — `pixelforgery` is NOT a `pixelforge` match", () => {
    const out = matchEvidence({ url: null, note: "see pixelforgery-studios" }, CANDIDATES);
    expect(out.matched).toBe(false);
  });

  test("the outcome NEVER carries a score/confidence/rank field (AD-17)", () => {
    const matched = matchEvidence(
      { url: "https://twitch.tv/novastream/segment-aurora", note: null },
      CANDIDATES,
    );
    // Exactly these keys — nothing rankable ever appears.
    expect(Object.keys(matched).sort()).toEqual(["deliverableId", "matched", "rule"]);
    const unmatched = matchEvidence({ url: null, note: null }, CANDIDATES);
    expect(Object.keys(unmatched)).toEqual(["matched"]);
    for (const o of [matched, unmatched]) {
      for (const banned of [
        "score",
        "confidence",
        "rank",
        "ranking",
        "probability",
        "likelihood",
      ]) {
        expect(banned in o).toBe(false);
      }
    }
  });
});

describe("normaliseUrl — pure, no network", () => {
  test.each([
    ["https://www.Twitch.tv/PixelForge/Seg/", "twitch.tv/pixelforge/seg"],
    ["http://x.test/a/b?q=1#frag", "x.test/a/b"],
    ["twitch.tv/novastream", "twitch.tv/novastream"],
    ["not a url", "not a url"],
  ])("%s → %s", (input, expected) => {
    expect(normaliseUrl(input)).toBe(expected);
  });
});
