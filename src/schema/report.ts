import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { campaign } from "./campaign";
import { claim } from "./claim";
import { REPORT_INCLUSION_OVERRIDE } from "./enums";
import { dataOriginCol, pk } from "./shared-columns";

/** Report — pins an immutable campaign-wide `evidence_snapshot_hash` at creation
 *  (AD-20). New evidence produces a NEW version, never a mutation of an in-flight
 *  report. The hash is the frozen instant everything assembles against; nothing
 *  status-shaped is stored — verdicts are recomputed through the ONE resolver at
 *  read time (AD-6), and staleness is `live campaign hash !== this frozen hash`
 *  (Epic-3 retro AI-3: a frozen Green is a shape that cannot exist here). */
export const report = sqliteTable(
  "report",
  {
    id: pk(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaign.id),
    version: integer("version").notNull(),
    /** Frozen at creation — a campaign-wide hash over every Claim's evidence
     *  snapshot (AD-20). Comparable across time (it excludes `now`), so it is the
     *  staleness tripwire the builder reads. */
    evidenceSnapshotHash: text("evidence_snapshot_hash").notNull(),
    /** Server-UTC ISO-8601 (AD-11) — deterministic version ordering. */
    createdAt: text("created_at").notNull(),
    dataOrigin: dataOriginCol(),
  },
  (t) => [
    // A campaign version is minted exactly once — never duplicated (AC1).
    uniqueIndex("report_campaign_version_unique").on(t.campaignId, t.version),
  ],
);

/** ReportItem — one per Claim per Report. Stores ONLY the operator's inclusion
 *  INTENT (`inclusion_override` + `overridden_by`) — the AD-6 override pattern.
 *  It stores NO status, NO materialized inclusion, and NO audience: those are all
 *  DERIVED at read time by the single resolver `resolveReportInclusion`
 *  (`effective_inclusion = inclusion_override ?? default_from_status(effectiveStatus)`,
 *  AD-21). This supersedes AD-21's literal "carries an audience flag" wording:
 *  audience is a derived value, not a stored column, because a stored
 *  status-derivative is exactly the stale-verdict shape the Epic-3 retro AI-3
 *  gate forbids ("if there's nowhere to put a frozen Green, no one can ship one"). */
export const reportItem = sqliteTable("report_item", {
  id: pk(),
  reportId: text("report_id")
    .notNull()
    .references(() => report.id),
  claimId: text("claim_id")
    .notNull()
    .references(() => claim.id),
  /** Operator's stored include/exclude intent; NULL = follow the status default. */
  inclusionOverride: text("inclusion_override", { enum: REPORT_INCLUSION_OVERRIDE }),
  /** Attribution for the override — recorded human responsibility (AD-21). NULL
   *  when no override is set; required to include a Red claim (with a Caveat). */
  overriddenBy: text("overridden_by"),
  dataOrigin: dataOriginCol(),
});
