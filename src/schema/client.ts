import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pk } from "./shared-columns";

/** Client — the agency's customer; owns Campaigns. */
export const client = sqliteTable("client", {
  id: pk(),
  name: text("name").notNull(),
});
