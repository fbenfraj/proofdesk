// AD-17 behavioral honesty test (Story 2.2, AC4 — Epic-1 retro action item #2).
//
// This is the FIRST moment AD-17 can actually be violated: the matcher now
// exists, so a MatchSuggestion / a `source='suggested'` EvidenceLink is real data
// that COULD, if the assembler were wrong, enter the AuditSnapshot and lift a
// verdict. Epic 1 fenced AD-17 by absence (no matcher, and the type has no
// suggestion field). This test fences it by BEHAVIOUR: feed a suggestion — and a
// suggested link carrying live+confirmed evidence that WOULD flip a Yellow claim
// to Green if it counted — and prove the snapshot ignores it, the verdict is
// unchanged, and only the operator-affirmed link does the lifting.

import { beforeEach, describe, expect, test } from "vitest";
import { seedDemoCampaign } from "@/seed/demo-campaign";
import {
  appendHumanConfirmation,
  countMatchSuggestions,
  createEvidenceItem,
  createEvidenceLink,
  createMatchSuggestion,
  createTestDb,
  type DbHandle,
} from "@/src/repositories";
// The SOLE snapshot assembler + the effective-status resolver live in services.
import { assembleSnapshot, resolveEffectiveStatus as resolveStatus } from "@/src/services";

const OP = "operator@studio.example";

function seed(handle: DbHandle) {
  const summary = seedDemoCampaign(handle.db);
  const d4 = summary.deliverables.find((d) => d.key === "D4");
  if (!d4) throw new Error("D4 missing from seed");
  const pop = d4.requirements.find((r) => r.kind === "proof-of-posting");
  if (!pop) throw new Error("D4 proof-of-posting requirement missing");
  return { campaignId: summary.campaignId, claimId: d4.claimId, popReqId: pop.proofRequirementId };
}

describe("AD-17 — a MatchSuggestion / suggested link never enters the snapshot or lifts a verdict", () => {
  let handle: DbHandle;
  beforeEach(() => {
    handle = createTestDb();
  });

  test("baseline: D4 (yellow-attestation) resolves to Yellow", () => {
    const { claimId } = seed(handle);
    const status = resolveStatus(handle.db, claimId, "2026-06-01T00:00:00.000Z");
    expect(status.effectiveStatus).toBe("yellow");
  });

  test("a suggested live+confirmed link is EXCLUDED from the snapshot and does not lift Yellow→Green", () => {
    const { db } = handle;
    const { campaignId, claimId, popReqId } = seed(handle);

    // A live, machine-checkable receipt + an operator confirmation on it — the
    // exact shape that lifts proof-of-posting to Green (AD-5) IF it were an
    // operator link. But we file it as `source='suggested'`, plus a MatchSuggestion.
    const liveItem = createEvidenceItem(db, {
      campaignId,
      type: "link",
      machineOrHuman: "machine",
      uploadedAt: "2026-06-01T09:00:00.000Z",
      livenessLabel: "live",
    });
    const suggestedLink = createEvidenceLink(db, {
      evidenceItemId: liveItem.id,
      proofRequirementId: popReqId,
      source: "suggested",
    });
    appendHumanConfirmation(db, { evidenceLinkId: suggestedLink.id, confirmedBy: OP });
    createMatchSuggestion(db, {
      evidenceItemId: liveItem.id,
      proofRequirementId: popReqId,
      rule: "url:twitch.tv/emberplays/segment-aurora",
    });

    // The suggestion genuinely exists…
    expect(countMatchSuggestions(db, campaignId)).toBe(1);

    // …but the snapshot's proof-of-posting row carries NO live link (only the
    // seeded human attestation, whose liveness is null). The suggested link and
    // its confirmation are invisible to the core.
    const snapshot = assembleSnapshot(db, claimId, "2026-06-01T10:00:00.000Z");
    const popRow = snapshot.claim.requirements.find((r) => r.proofRequirementId === popReqId);
    expect(popRow).toBeDefined();
    const livenessSeen = popRow?.operatorEvidence.map((e) => e.livenessLabel) ?? [];
    expect(livenessSeen).not.toContain("live");

    // And the verdict is unchanged — a suggestion can never lift a verdict.
    const status = resolveStatus(db, claimId, "2026-06-01T10:00:00.000Z");
    expect(status.effectiveStatus).toBe("yellow");
    expect(status.machineVerdict).toBe("yellow");
  });

  test("positive control: the IDENTICAL evidence as an OPERATOR link DOES enter the snapshot and lift Yellow→Green", () => {
    const { db } = handle;
    const { campaignId, claimId, popReqId } = seed(handle);

    const liveItem = createEvidenceItem(db, {
      campaignId,
      type: "link",
      machineOrHuman: "machine",
      uploadedAt: "2026-06-01T09:00:00.000Z",
      livenessLabel: "live",
    });
    const operatorLink = createEvidenceLink(db, {
      evidenceItemId: liveItem.id,
      proofRequirementId: popReqId,
      source: "operator", // the ONLY difference from the test above
    });
    appendHumanConfirmation(db, { evidenceLinkId: operatorLink.id, confirmedBy: OP });

    const snapshot = assembleSnapshot(db, claimId, "2026-06-01T10:00:00.000Z");
    const popRow = snapshot.claim.requirements.find((r) => r.proofRequirementId === popReqId);
    const livenessSeen = popRow?.operatorEvidence.map((e) => e.livenessLabel) ?? [];
    expect(livenessSeen).toContain("live");

    const status = resolveStatus(db, claimId, "2026-06-01T10:00:00.000Z");
    expect(status.effectiveStatus).toBe("green");
  });
});
