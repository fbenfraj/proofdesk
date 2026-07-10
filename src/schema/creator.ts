import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { campaign } from "./campaign";
import { pk } from "./shared-columns";

/** Creator — a person/handle producing Deliverables within one Campaign. */
export const creator = sqliteTable("creator", {
  id: pk(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaign.id),
  name: text("name").notNull(),
  /** The creator's platform handle (no leading `@`, lower-case), e.g.
   *  `pixelforge`. Used by the deterministic Evidence→Deliverable matcher
   *  (Story 2.2, FR-6): a handle appearing in ingested evidence maps to this
   *  Creator. NULL when no handle is known. It is a matching key ONLY — never a
   *  confidence signal (AD-17). */
  handle: text("handle"),
});
