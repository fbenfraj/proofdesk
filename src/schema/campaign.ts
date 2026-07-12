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
  /** Immutable (AD-9). `true` DISABLES the Client-Safe Report export path — the
   *  hard-wall is now LIVE in the export layer (Story 4.4): `buildReportDownload`
   *  (`app/_lib/report-export.ts`) + the `report/download` route refuse a demo
   *  (403, no bytes) before assembling anything, and the on-screen document
   *  carries the SAMPLE marker. This column is the immutable root the wall reads;
   *  the on-screen SAMPLE view stays allowed (AD-9/AD-20/21). */
  isDemo: integer("is_demo", { mode: "boolean" }).notNull(),
});
