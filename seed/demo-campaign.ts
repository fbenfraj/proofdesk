// The magic-moment demo seed (Story 1.4, NFR-D6, AD-9). A PURE builder: it
// takes an injected `Db` handle and writes ONE `data_origin=seeded`,
// `is_demo=true` Campaign with 9 Deliverables shaped so that when the Proof
// Audit engine (Story 1.5) later runs, the REAL engine yields 7 Green · 1
// Yellow · 1 Red. No verdict is stored or hard-coded here — only the inputs.
//
// It touches the DB ONLY through the repository seam (AD-2, AD-10) and uses
// fixed UTC timestamps (no `Date.now()`), so the demo and its test are
// deterministic. `data_origin` is never passed — it is derived from the
// Campaign at the single site in the repository (AD-9).
//
// References nothing from Epic 2 (verification adapter / matcher) or Epic 3
// (ruleset templates): the EQ-2 precondition that keeps every Epic-1 story
// runnable over seeded data on its own.

import {
  appendHumanConfirmation,
  createCampaign,
  createClaim,
  createClient,
  createCreator,
  createDeliverable,
  createEvidenceItem,
  createEvidenceLink,
  createProofRequirement,
  type Db,
} from "@/src/repositories";
import type { Criticality, LivenessLabel, ProofStatus } from "@/src/schema";

/** Stable id so a re-run can detect the demo Campaign and skip (idempotency). */
export const SEED_DEMO_CAMPAIGN_ID = "seed-demo-campaign-0001";
export const SEED_DEMO_CAMPAIGN_NAME = "Aurora Energy - Q2 Creator Push";
export const SEED_DEMO_CLIENT_NAME = "Aurora Energy";
/** Every Deliverable is human-marked "done" — deliberately independent of its
 *  Proof Status. 9/9 claimed is the whole premise of the magic moment. */
const CLAIMED_STATUS = "delivered";
const OPERATOR = "camille@studio-kairos.example";

// --- Requirement + evidence shapes ---------------------------------------

/** How a Deliverable's critical proof-of-posting is evidenced. Drives the
 *  intended verdict; the verdict itself is computed by the engine in 1.5. */
type ProofShape =
  | "green-link" // live operator link + confirmation  → intended Green
  | "yellow-attestation" // confirmed human attestation, NO live link → intended Yellow
  | "red-absent"; // no evidence at all                  → intended Red

/** Creator platform handles (no leading `@`, lower-case) — the deterministic
 *  matcher's handle key (Story 2.2, FR-6). A matching key ONLY, never a
 *  confidence signal (AD-17). */
const CREATOR_HANDLES: Readonly<Record<string, string>> = {
  PixelForge: "pixelforge",
  NovaStream: "novastream",
  EmberPlays: "emberplays",
  "Lise Moreau": "lisemoreau",
  "Théo Blanc": "theoblanc",
  "Camille Dubois": "camilledubois",
};

interface DeliverableSpec {
  key: string; // "D1".."D9" — traceability only
  lane: "twitch" | "broader";
  creator: string;
  type: string;
  shape: ProofShape;
  /** The canonical platform URL this Deliverable lives at — the matcher's URL
   *  key (Story 2.2, FR-6). Distinct per Deliverable so a pasted link resolves
   *  to exactly one (never fetched here — liveness is Story 2.4). */
  platformUrl: string;
  /** Optional supporting requirement (present = satisfied, missing → caps at
   *  Yellow in 1.5). Always a Human assertion (AD-19). */
  supporting?: "reach-metric" | "segment-timestamp";
  intendedVerdict: ProofStatus; // DESIGN INTENT, documented — never persisted
  /** Fixed UTC date stem for this Deliverable's evidence (determinism). */
  day: string; // e.g. "2026-05-14"
}

/** The 9-Deliverable plan (see Story 1.4 Dev Notes). Twitch lane + broader lane;
 *  PixelForge / Lise Moreau / Théo Blanc each own two Deliverables. */
const PLAN: readonly DeliverableSpec[] = [
  {
    key: "D1",
    lane: "twitch",
    creator: "PixelForge",
    type: "Twitch sponsor segment",
    shape: "green-link",
    platformUrl: "https://twitch.tv/pixelforge/segment-aurora",
    supporting: "reach-metric",
    intendedVerdict: "green",
    day: "2026-05-12",
  },
  {
    key: "D2",
    lane: "twitch",
    creator: "NovaStream",
    type: "Twitch sponsor segment",
    shape: "green-link",
    platformUrl: "https://twitch.tv/novastream/segment-aurora",
    supporting: "reach-metric",
    intendedVerdict: "green",
    day: "2026-05-13",
  },
  {
    key: "D3",
    lane: "twitch",
    creator: "PixelForge",
    type: "Twitch highlight clip",
    shape: "green-link",
    platformUrl: "https://twitch.tv/pixelforge/clip/aurora-highlight",
    intendedVerdict: "green",
    day: "2026-05-14",
  },
  {
    key: "D4",
    lane: "twitch",
    creator: "EmberPlays",
    type: "Twitch sponsor segment",
    shape: "yellow-attestation",
    platformUrl: "https://twitch.tv/emberplays/segment-aurora",
    supporting: "segment-timestamp",
    intendedVerdict: "yellow",
    day: "2026-05-15",
  },
  {
    key: "D5",
    lane: "broader",
    creator: "Lise Moreau",
    type: "Instagram Reel",
    shape: "green-link",
    platformUrl: "https://instagram.com/lisemoreau/reel/aurora-1",
    supporting: "reach-metric",
    intendedVerdict: "green",
    day: "2026-05-16",
  },
  {
    key: "D6",
    lane: "broader",
    creator: "Théo Blanc",
    type: "TikTok video",
    shape: "green-link",
    platformUrl: "https://tiktok.com/@theoblanc/video/aurora-1",
    intendedVerdict: "green",
    day: "2026-05-17",
  },
  {
    key: "D7",
    lane: "broader",
    creator: "Lise Moreau",
    type: "Instagram Reel",
    shape: "green-link",
    platformUrl: "https://instagram.com/lisemoreau/reel/aurora-2",
    intendedVerdict: "green",
    day: "2026-05-18",
  },
  {
    key: "D8",
    lane: "broader",
    creator: "Camille Dubois",
    type: "Instagram Story",
    shape: "red-absent",
    platformUrl: "https://instagram.com/camilledubois/story/aurora-1",
    intendedVerdict: "red",
    day: "2026-05-19",
  },
  {
    key: "D9",
    lane: "broader",
    creator: "Théo Blanc",
    type: "Sponsored Instagram post",
    shape: "green-link",
    platformUrl: "https://instagram.com/theoblanc/p/aurora-1",
    supporting: "reach-metric",
    intendedVerdict: "green",
    day: "2026-05-20",
  },
] as const;

const PROOF_OF_POSTING = "proof-of-posting";
const DISCLOSURE_VISIBLE = "disclosure-visible";

// --- Return summary (so the test can assert shapes without raw SQL) --------

export interface SeededRequirementSummary {
  proofRequirementId: string;
  kind: string;
  criticality: Criticality;
  evidenceLinkCount: number;
  humanConfirmationCount: number;
  /** Liveness labels of the EvidenceItems linked to this requirement. */
  livenessLabels: (LivenessLabel | null)[];
}

export interface SeededDeliverableSummary {
  key: string;
  deliverableId: string;
  claimId: string;
  creatorId: string;
  type: string;
  intendedVerdict: ProofStatus;
  requirements: SeededRequirementSummary[];
}

export interface SeedSummary {
  campaignId: string;
  clientId: string;
  creators: { id: string; name: string }[];
  deliverables: SeededDeliverableSummary[];
}

// --- Builder ---------------------------------------------------------------

/**
 * Seed the demo Campaign and its full evidence graph. Idempotency (skip if
 * already seeded) is the CLI shell's job (`seed/index.ts`); this builder assumes
 * a fresh Campaign and always writes.
 */
export function seedDemoCampaign(db: Db): SeedSummary {
  const client = createClient(db, SEED_DEMO_CLIENT_NAME);
  const campaign = createCampaign(db, {
    id: SEED_DEMO_CAMPAIGN_ID,
    clientId: client.id,
    name: SEED_DEMO_CAMPAIGN_NAME,
    dataOrigin: "seeded",
    isDemo: true,
  });

  // Creators are deduped by name (some own two Deliverables).
  const creatorIds = new Map<string, string>();
  const creatorId = (name: string): string => {
    const existing = creatorIds.get(name);
    if (existing) return existing;
    const created = createCreator(db, campaign.id, name, CREATOR_HANDLES[name]);
    creatorIds.set(name, created.id);
    return created.id;
  };

  const deliverables: SeededDeliverableSummary[] = [];
  for (const spec of PLAN) {
    deliverables.push(seedDeliverable(db, campaign.id, spec, creatorId(spec.creator)));
  }

  return {
    campaignId: campaign.id,
    clientId: client.id,
    creators: [...creatorIds].map(([name, id]) => ({ id, name })),
    deliverables,
  };
}

function seedDeliverable(
  db: Db,
  campaignId: string,
  spec: DeliverableSpec,
  creatorId: string,
): SeededDeliverableSummary {
  const deliverable = createDeliverable(db, {
    campaignId,
    creatorId,
    type: spec.type,
    claimedStatus: CLAIMED_STATUS,
    platformUrl: spec.platformUrl,
  });
  const claim = createClaim(db, deliverable.id);

  const requirements: SeededRequirementSummary[] = [];

  // Critical #1 — proof-of-posting, evidenced per the Deliverable's shape.
  const posting = createProofRequirement(db, {
    deliverableId: deliverable.id,
    kind: PROOF_OF_POSTING,
    criticality: "critical",
  });
  requirements.push(seedProofOfPosting(db, campaignId, posting.id, spec));

  // Critical #2 — disclosure visible. Present for every shape EXCEPT the Red
  // one (expired Story, nothing captured — the requirement exists, unmet).
  // Keyed as the baseline `collaboration-commerciale` France/EU disclosure
  // (Story 3.3) so the checklist recognizes it (no duplicate) and renders its
  // localized name; the key is verdict-neutral (not in the AuditSnapshot).
  const disclosure = createProofRequirement(db, {
    deliverableId: deliverable.id,
    kind: DISCLOSURE_VISIBLE,
    criticality: "critical",
    disclosureKey: "collaboration-commerciale",
  });
  requirements.push(
    spec.shape === "red-absent"
      ? emptyReqSummary(disclosure.id, DISCLOSURE_VISIBLE, "critical")
      : seedDisclosure(db, campaignId, disclosure.id, spec),
  );

  // Optional supporting requirement (Human assertion; missing → Yellow in 1.5).
  if (spec.supporting) {
    const support = createProofRequirement(db, {
      deliverableId: deliverable.id,
      kind: spec.supporting,
      criticality: "supporting",
    });
    requirements.push(seedSupportingMetric(db, campaignId, support.id, spec));
  }

  return {
    key: spec.key,
    deliverableId: deliverable.id,
    claimId: claim.id,
    creatorId,
    type: spec.type,
    intendedVerdict: spec.intendedVerdict,
    requirements,
  };
}

/** Proof-of-posting evidence, by shape. */
function seedProofOfPosting(
  db: Db,
  campaignId: string,
  proofRequirementId: string,
  spec: DeliverableSpec,
): SeededRequirementSummary {
  if (spec.shape === "red-absent") {
    // Expired IG Story, no capture: no evidence, no link, no confirmation.
    return emptyReqSummary(proofRequirementId, PROOF_OF_POSTING, "critical");
  }

  if (spec.shape === "yellow-attestation") {
    // Rests on the creator's word: a Human attestation (no live link). The
    // operator confirms the attestation, but there is NO machine reachability,
    // so the engine (1.5) caps this at Yellow.
    const attestation = createEvidenceItem(db, {
      campaignId,
      type: "creator-attestation",
      machineOrHuman: "human",
      uploadedAt: `${spec.day}T20:11:00.000Z`,
      // Deliberately NO livenessLabel — nothing machine-checkable here.
    });
    const link = createEvidenceLink(db, {
      evidenceItemId: attestation.id,
      proofRequirementId,
      source: "operator",
    });
    appendHumanConfirmation(db, {
      evidenceLinkId: link.id,
      confirmedBy: OPERATOR,
      confirmedAt: `${spec.day}T20:12:00.000Z`,
    });
    return {
      proofRequirementId,
      kind: PROOF_OF_POSTING,
      criticality: "critical",
      evidenceLinkCount: 1,
      humanConfirmationCount: 1,
      livenessLabels: [attestation.livenessLabel],
    };
  }

  // green-link: a machine-checkable link that resolved `live`, PLUS an operator
  // HumanConfirmation that the resolved page shows the Deliverable (AD-5, AD-18).
  const linkItem = createEvidenceItem(db, {
    campaignId,
    type: "link",
    machineOrHuman: "machine",
    uploadedAt: `${spec.day}T20:11:00.000Z`,
    livenessLabel: "live" satisfies LivenessLabel,
  });
  const link = createEvidenceLink(db, {
    evidenceItemId: linkItem.id,
    proofRequirementId,
    source: "operator",
  });
  appendHumanConfirmation(db, {
    evidenceLinkId: link.id,
    confirmedBy: OPERATOR,
    confirmedAt: `${spec.day}T20:12:00.000Z`,
  });
  return {
    proofRequirementId,
    kind: PROOF_OF_POSTING,
    criticality: "critical",
    evidenceLinkCount: 1,
    humanConfirmationCount: 1,
    livenessLabels: [linkItem.livenessLabel],
  };
}

/** Disclosure evidence — a screenshot (always a Human assertion, AD-19) plus an
 *  operator confirmation it is visibly present. */
function seedDisclosure(
  db: Db,
  campaignId: string,
  proofRequirementId: string,
  spec: DeliverableSpec,
): SeededRequirementSummary {
  const screenshot = createEvidenceItem(db, {
    campaignId,
    type: "disclosure-screenshot",
    machineOrHuman: "human",
    uploadedAt: `${spec.day}T20:13:00.000Z`,
  });
  const link = createEvidenceLink(db, {
    evidenceItemId: screenshot.id,
    proofRequirementId,
    source: "operator",
  });
  appendHumanConfirmation(db, {
    evidenceLinkId: link.id,
    confirmedBy: OPERATOR,
    confirmedAt: `${spec.day}T20:14:00.000Z`,
  });
  return {
    proofRequirementId,
    kind: DISCLOSURE_VISIBLE,
    criticality: "critical",
    evidenceLinkCount: 1,
    humanConfirmationCount: 1,
    livenessLabels: [screenshot.livenessLabel],
  };
}

/** A supporting metric — a Human-asserted figure (viewer/reach), never
 *  machine-verified (AD-19). Present = satisfied; no confirmation needed. */
function seedSupportingMetric(
  db: Db,
  campaignId: string,
  proofRequirementId: string,
  spec: DeliverableSpec,
): SeededRequirementSummary {
  const metric = createEvidenceItem(db, {
    campaignId,
    type: "metric-screenshot",
    machineOrHuman: "human",
    uploadedAt: `${spec.day}T20:15:00.000Z`,
  });
  createEvidenceLink(db, {
    evidenceItemId: metric.id,
    proofRequirementId,
    source: "operator",
  });
  return {
    proofRequirementId,
    kind: spec.supporting ?? "reach-metric",
    criticality: "supporting",
    evidenceLinkCount: 1,
    humanConfirmationCount: 0,
    livenessLabels: [metric.livenessLabel],
  };
}

function emptyReqSummary(
  proofRequirementId: string,
  kind: string,
  criticality: Criticality,
): SeededRequirementSummary {
  return {
    proofRequirementId,
    kind,
    criticality,
    evidenceLinkCount: 0,
    humanConfirmationCount: 0,
    livenessLabels: [],
  };
}
