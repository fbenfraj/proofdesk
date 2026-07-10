// The matching + affirmation service (Story 2.2, FR-6, AD-17). Covers the write
// orchestration over the seeded demo: the matcher writes a MatchSuggestion only;
// operator affirmation writes a single `source=operator` EvidenceLink; reassign
// re-links; unassign reverses; and a machine re-run never disturbs an operator's
// decision. Repository-level guards (cross-campaign) are asserted too.

import { beforeEach, describe, expect, test } from "vitest";
import { seedDemoCampaign } from "@/seed/demo-campaign";
import {
  countMatchSuggestions,
  createCampaign,
  createClaim,
  createClient,
  createCreator,
  createDeliverable,
  createEvidenceItem,
  createMatchSuggestion,
  createProofRequirement,
  createTestDb,
  type DbHandle,
  getOperatorAssignmentForEvidence,
  listEvidenceLinks,
  MixedOriginError,
} from "@/src/repositories";
import {
  assignEvidence,
  readMatchState,
  runMatchForEvidenceItem,
  unassignEvidence,
} from "@/src/services";

// D1 (PixelForge, Twitch sponsor segment) — distinct platform URL, matches by URL.
const D1_URL = "https://twitch.tv/pixelforge/segment-aurora";

function seed(handle: DbHandle) {
  const summary = seedDemoCampaign(handle.db);
  const byKey = (k: string) => {
    const d = summary.deliverables.find((x) => x.key === k);
    if (!d) throw new Error(`${k} missing`);
    return d;
  };
  return { campaignId: summary.campaignId, d1: byKey("D1"), d3: byKey("D3") };
}

function ingestUrl(handle: DbHandle, campaignId: string, url: string) {
  return createEvidenceItem(handle.db, {
    campaignId,
    type: "link",
    machineOrHuman: "machine",
    intakeKind: "url",
    url,
    uploadedAt: "2026-06-01T09:00:00.000Z",
  });
}

function operatorLinkCount(handle: DbHandle, campaignId: string, evidenceItemId: string): number {
  return listEvidenceLinks(handle.db, campaignId).filter(
    (l) => l.evidenceItemId === evidenceItemId && l.source === "operator",
  ).length;
}

describe("runMatchForEvidenceItem — writes a MatchSuggestion only (AD-17)", () => {
  let handle: DbHandle;
  beforeEach(() => {
    handle = createTestDb();
  });

  test("a URL matching exactly one Deliverable → a seeded-origin suggestion", () => {
    const { campaignId } = seed(handle);
    const item = ingestUrl(handle, campaignId, D1_URL);

    const suggestion = runMatchForEvidenceItem(handle.db, item.id);
    expect(suggestion).not.toBeNull();
    expect(suggestion?.creatorName).toBe("PixelForge");
    expect(suggestion?.deliverableType).toBe("Twitch sponsor segment");
    expect(suggestion?.rule.startsWith("url:")).toBe(true);

    // A MatchSuggestion exists — and NO operator EvidenceLink was written.
    expect(countMatchSuggestions(handle.db, campaignId)).toBe(1);
    expect(operatorLinkCount(handle, campaignId, item.id)).toBe(0);

    const state = readMatchState(handle.db, item.id);
    expect(state.status).toBe("suggested");
  });

  test("re-running matching is idempotent — never accumulates suggestions", () => {
    const { campaignId } = seed(handle);
    const item = ingestUrl(handle, campaignId, D1_URL);
    runMatchForEvidenceItem(handle.db, item.id);
    runMatchForEvidenceItem(handle.db, item.id);
    expect(countMatchSuggestions(handle.db, campaignId)).toBe(1);
  });

  test("zero rule matches → Unassigned, no suggestion", () => {
    const { campaignId } = seed(handle);
    const item = ingestUrl(handle, campaignId, "https://example.com/nothing-here");
    expect(runMatchForEvidenceItem(handle.db, item.id)).toBeNull();
    expect(countMatchSuggestions(handle.db, campaignId)).toBe(0);
    expect(readMatchState(handle.db, item.id).status).toBe("unassigned");
  });
});

describe("assignEvidence — operator affirmation writes ONE operator link", () => {
  let handle: DbHandle;
  beforeEach(() => {
    handle = createTestDb();
  });

  test("Confirm writes a source=operator link and consumes the suggestion", () => {
    const { campaignId, d1 } = seed(handle);
    const item = ingestUrl(handle, campaignId, D1_URL);
    runMatchForEvidenceItem(handle.db, item.id);

    const assignment = assignEvidence(handle.db, {
      evidenceItemId: item.id,
      deliverableId: d1.deliverableId,
    });
    expect(assignment).not.toBeNull();
    expect(assignment?.deliverableId).toBe(d1.deliverableId);

    // Exactly one operator link; the suggestion is gone.
    expect(operatorLinkCount(handle, campaignId, item.id)).toBe(1);
    expect(countMatchSuggestions(handle.db, campaignId)).toBe(0);
    expect(readMatchState(handle.db, item.id).status).toBe("assigned");
  });

  test("Reassign re-links to a different Deliverable — still exactly one operator link", () => {
    const { campaignId, d1, d3 } = seed(handle);
    const item = ingestUrl(handle, campaignId, D1_URL);
    assignEvidence(handle.db, { evidenceItemId: item.id, deliverableId: d1.deliverableId });
    assignEvidence(handle.db, { evidenceItemId: item.id, deliverableId: d3.deliverableId });

    expect(operatorLinkCount(handle, campaignId, item.id)).toBe(1);
    const assignment = getOperatorAssignmentForEvidence(handle.db, item.id);
    expect(assignment?.deliverableId).toBe(d3.deliverableId);
  });

  test("unassign reverses the assignment and restores the rule suggestion (NFR-D7)", () => {
    const { campaignId, d1 } = seed(handle);
    const item = ingestUrl(handle, campaignId, D1_URL);
    assignEvidence(handle.db, { evidenceItemId: item.id, deliverableId: d1.deliverableId });
    expect(readMatchState(handle.db, item.id).status).toBe("assigned");

    const state = unassignEvidence(handle.db, item.id);
    expect(operatorLinkCount(handle, campaignId, item.id)).toBe(0);
    // The deterministic rule still fires, so a suggestion is restored.
    expect(state?.status).toBe("suggested");
  });

  test("a machine re-run NEVER overwrites an operator decision", () => {
    const { campaignId, d1 } = seed(handle);
    const item = ingestUrl(handle, campaignId, D1_URL);
    assignEvidence(handle.db, { evidenceItemId: item.id, deliverableId: d1.deliverableId });

    // Re-running the matcher on an already-assigned item is a no-op.
    expect(runMatchForEvidenceItem(handle.db, item.id)).toBeNull();
    expect(countMatchSuggestions(handle.db, campaignId)).toBe(0);
    expect(readMatchState(handle.db, item.id).status).toBe("assigned");
  });
});

describe("createMatchSuggestion — repository guards", () => {
  test("rejects a cross-campaign suggestion (AD-9)", () => {
    const handle = createTestDb();
    const { db } = handle;
    // Campaign A with an ingested item.
    const { campaignId: campA } = seed(handle);
    const itemA = ingestUrl(handle, campA, D1_URL);

    // Campaign B with its own requirement.
    const clientB = createClient(db, "Other Co");
    const campB = createCampaign(db, {
      clientId: clientB.id,
      name: "Other",
      dataOrigin: "real",
      isDemo: false,
    });
    const creatorB = createCreator(db, campB.id, "SomeoneElse", "someoneelse");
    const delivB = createDeliverable(db, {
      campaignId: campB.id,
      creatorId: creatorB.id,
      type: "IG Reel",
      claimedStatus: "delivered",
    });
    createClaim(db, delivB.id);
    const reqB = createProofRequirement(db, {
      deliverableId: delivB.id,
      kind: "proof-of-posting",
      criticality: "critical",
    });

    expect(() =>
      createMatchSuggestion(db, {
        evidenceItemId: itemA.id,
        proofRequirementId: reqB.id,
        rule: "url:x",
      }),
    ).toThrow(MixedOriginError);
  });

  test("a rejected cross-campaign reassign PRESERVES the existing assignment (no data-loss)", () => {
    const handle = createTestDb();
    const { db } = handle;
    const { campaignId: campA, d1 } = seed(handle);
    const item = ingestUrl(handle, campA, D1_URL);
    // First, a valid assignment in campaign A.
    assignEvidence(db, { evidenceItemId: item.id, deliverableId: d1.deliverableId });
    expect(operatorLinkCount(handle, campA, item.id)).toBe(1);

    // A Deliverable in a DIFFERENT campaign.
    const clientB = createClient(db, "Other Co");
    const campB = createCampaign(db, {
      clientId: clientB.id,
      name: "Other",
      dataOrigin: "real",
      isDemo: false,
    });
    const creatorB = createCreator(db, campB.id, "SomeoneElse", "someoneelse");
    const delivB = createDeliverable(db, {
      campaignId: campB.id,
      creatorId: creatorB.id,
      type: "IG Reel",
      claimedStatus: "delivered",
    });
    createClaim(db, delivB.id);
    createProofRequirement(db, {
      deliverableId: delivB.id,
      kind: "proof-of-posting",
      criticality: "critical",
    });

    // Reassigning to the foreign Deliverable is rejected — and the ORIGINAL
    // operator link survives intact (the delete never runs on the reject path).
    expect(() => assignEvidence(db, { evidenceItemId: item.id, deliverableId: delivB.id })).toThrow(
      MixedOriginError,
    );
    expect(operatorLinkCount(handle, campA, item.id)).toBe(1);
    expect(getOperatorAssignmentForEvidence(db, item.id)?.deliverableId).toBe(d1.deliverableId);
  });
});
