import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { campaign } from "./campaign";
import { claim } from "./claim";
import { REPORT_ITEM_AUDIENCE } from "./enums";
import { dataOriginCol, pk } from "./shared-columns";

/** Report — pins an immutable `evidence_snapshot_hash` at creation (AD-20). New
 *  evidence produces a NEW version, never a mutation of an in-flight report. */
export const report = sqliteTable("report", {
  id: pk(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaign.id),
  version: integer("version").notNull(),
  /** Frozen at creation — the instant everything below assembles against (AD-20). */
  evidenceSnapshotHash: text("evidence_snapshot_hash").notNull(),
  dataOrigin: dataOriginCol(),
});

/** ReportItem — frozen per Report, one per Claim. `audience` splits
 *  `client_visible | internal_only`: Red is excluded from the client view but
 *  listed in an internal-only follow-up section (AD-21). Inclusion is derived,
 *  never materialized — resolved in one place in Story 4.1. */
export const reportItem = sqliteTable("report_item", {
  id: pk(),
  reportId: text("report_id")
    .notNull()
    .references(() => report.id),
  claimId: text("claim_id")
    .notNull()
    .references(() => claim.id),
  audience: text("audience", { enum: REPORT_ITEM_AUDIENCE }).notNull(),
  dataOrigin: dataOriginCol(),
});
