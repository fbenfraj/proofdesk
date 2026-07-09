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
});
