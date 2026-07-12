import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { client } from "./client";
import { DATA_ORIGIN } from "./enums";
import { pk } from "./shared-columns";

/** Campaign — the unit of work. `data_origin` and `is_demo` are set once and
 *  are IMMUTABLE (AD-9); the repository rejects any update to them. Every
 *  exportable child inherits `data_origin` from here at write time. */
export const campaign = sqliteTable("campaign", {
  id: pk(),
  clientId: text("client_id")
    .notNull()
    .references(() => client.id),
  name: text("name").notNull(),
  /** `seeded | real` — immutable (AD-9). The hard-wall root. */
  dataOrigin: text("data_origin", { enum: DATA_ORIGIN }).notNull(),
  /** Immutable (AD-9). `true` is INTENDED to disable the Client-Safe Report
   *  export path — that enforcement lands in the export layer in Epic 4
   *  (AD-9/AD-20/21, Story 4-4). Nothing disables it today; this column is the
   *  immutable root the hard-wall will read, not a live gate. */
  isDemo: integer("is_demo", { mode: "boolean" }).notNull(),
});
