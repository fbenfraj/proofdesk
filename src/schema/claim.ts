import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { deliverable } from "./deliverable";
import { pk } from "./shared-columns";

/** Claim — the assertion "this Deliverable was delivered." 1:1 with Deliverable
 *  (the `unique` FK enforces it). Its effective Proof Status is derived, never
 *  stored as a materialized flag (AD-4, AD-6). */
export const claim = sqliteTable("claim", {
  id: pk(),
  deliverableId: text("deliverable_id")
    .notNull()
    .unique()
    .references(() => deliverable.id),
});
