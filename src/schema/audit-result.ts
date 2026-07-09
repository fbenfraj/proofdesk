import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { TraceEntry } from "./audit-snapshot";
import { claim } from "./claim";
import { PROOF_STATUS } from "./enums";
import { dataOriginCol, pk } from "./shared-columns";

/** AuditResult — the derived cache + history for a Claim's machine verdict
 *  (AD-4). Never a materialized status flag consumers trust blindly: the
 *  effective-status resolver (Story 1.5) recomputes-and-persists first if the
 *  identity tuple is stale. Stores the verbatim `trace` and the identity tuple
 *  `(ruleset_version, campaign_override_hash, evidence_snapshot_hash)`. */
export const auditResult = sqliteTable("audit_result", {
  id: pk(),
  claimId: text("claim_id")
    .notNull()
    .references(() => claim.id),
  /** The machine verdict operand for the effective-status resolver (AD-6). */
  machineVerdict: text("machine_verdict", { enum: PROOF_STATUS }).notNull(),
  /** Verbatim decomposed sub-facts, each carrying `machine_or_human` (AD-3/AD-4). */
  trace: text("trace", { mode: "json" }).$type<TraceEntry[]>().notNull(),
  snapshotVersion: integer("snapshot_version").notNull(),
  // --- identity tuple (AD-4): the cache is stale if any element changes ---
  rulesetVersion: text("ruleset_version").notNull(),
  campaignOverrideHash: text("campaign_override_hash").notNull(),
  evidenceSnapshotHash: text("evidence_snapshot_hash").notNull(),
  dataOrigin: dataOriginCol(),
});
