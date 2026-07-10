import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { campaign } from "./campaign";
import { creator } from "./creator";
import { pk } from "./shared-columns";

/** Deliverable — one promised piece of content. Maps to exactly one Claim. */
export const deliverable = sqliteTable("deliverable", {
  id: pk(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaign.id),
  creatorId: text("creator_id")
    .notNull()
    .references(() => creator.id),
  /** e.g. Twitch sponsor segment, IG Reel, IG Story, TikTok, YouTube integration. */
  type: text("type").notNull(),
  /** Human-set claimed marker — independent of Proof Status (FR-1/FR-2). */
  claimedStatus: text("claimed_status").notNull(),
  /** The canonical platform URL this Deliverable is expected to live at, e.g.
   *  `https://twitch.tv/pixelforge/segment-aurora`. The deterministic matcher
   *  (Story 2.2, FR-6) suggests THIS Deliverable when an ingested link equals it
   *  or is a sub-path of it. NULL when no platform URL is known. A matching key
   *  ONLY — never fetched here (link liveness is Story 2.4) and never a
   *  confidence signal (AD-17). */
  platformUrl: text("platform_url"),
});
