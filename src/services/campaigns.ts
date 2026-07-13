// src/services/campaigns — the live-demo add-flow orchestration (Story AI-12).
// Three thin services over the existing repository write primitives:
//   - listCampaigns: the switcher's read (identity only, never a verdict).
//   - createScenario: start a new, empty scenario for a live demo.
//   - addDeliverableItem: add one Board item (creator? + deliverable + 1:1 claim).
// They never touch the DB driver directly (AD-2); they orchestrate the repository.
// Everything created here is a DEMO (is_demo=true, seeded) so the export hard-wall
// stays closed and origin inherits immutably onto every child (AD-9).

import {
  createCampaign,
  createClaim,
  createClient,
  createCreator,
  createDeliverable,
  type Db,
  getCampaign,
} from "@/src/repositories";

// The switcher's campaign-list read is a plain data-access query, so it lives in
// the repository layer (AD-2: services orchestrate repositories, they never touch
// the DB driver directly). Re-exported here so the `@/src/services` import surface
// stays the one place callers reach the add-flow API.
export { type CampaignSummary, listCampaigns } from "@/src/repositories";

/** The default name for a scenario started live with no name typed. A persisted
 *  record value (not chrome), so it lives here, not in i18n; no dashes (copy guard
 *  is for rendered chrome, but we keep record copy clean too). */
const DEFAULT_SCENARIO_NAME = "New live scenario";

/** Start a new, empty scenario for a live demo. ALWAYS a demo (is_demo=true) with
 *  seeded origin (AD-9): a scenario built live in front of a client is
 *  demonstration data, so the export hard-wall must stay closed and every child it
 *  later gains inherits `seeded`. Creating a `real`, exportable campaign is a
 *  separate onboarding flow (AD-9's "clone into a fresh real Campaign"),
 *  deliberately not reachable from here. */
export function createScenario(db: Db, input: { name?: string }): { id: string; name: string } {
  const name = input.name?.trim() || DEFAULT_SCENARIO_NAME;
  const client = createClient(db, name);
  const created = createCampaign(db, {
    clientId: client.id,
    name,
    dataOrigin: "seeded",
    isDemo: true,
  });
  return { id: created.id, name: created.name };
}

/** Either an existing creator (by id) or a new one to create inline (name + handle). */
export type CreatorRef = { id: string } | { name: string; handle?: string };

export interface AddDeliverableInput {
  campaignId: string;
  creator: CreatorRef;
  type: string;
  /** Optional platform URL - a matcher key only, never fetched here (Story 2.2/2.4). */
  platformUrl?: string;
}

/** Add one item to the Board live: resolve-or-create the creator, then create the
 *  deliverable and its 1:1 Claim. The claim carries NO verdict - effective Proof
 *  Status is derived, never materialized (AD-4/AD-6), so a fresh item reads
 *  `pending` on the Board until "Run the audit" runs. `claimedStatus` is
 *  "delivered" (the seed's convention): a Claim asserts the deliverable was
 *  delivered; that human marker is independent of Proof Status (FR-1/FR-2). Origin
 *  is inherited from the campaign by the repository's single site (AD-9). Throws
 *  if the campaign does not exist. */
export function addDeliverableItem(
  db: Db,
  input: AddDeliverableInput,
): { deliverableId: string; claimId: string; creatorId: string } {
  if (!getCampaign(db, input.campaignId)) {
    throw new Error(`Campaign not found: ${input.campaignId}`);
  }
  const creatorId =
    "id" in input.creator
      ? input.creator.id
      : createCreator(db, input.campaignId, input.creator.name, input.creator.handle).id;
  const created = createDeliverable(db, {
    campaignId: input.campaignId,
    creatorId,
    type: input.type,
    claimedStatus: "delivered",
    platformUrl: input.platformUrl,
  });
  const claim = createClaim(db, created.id);
  return { deliverableId: created.id, claimId: claim.id, creatorId };
}
