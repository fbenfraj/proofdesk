import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { claim } from "./claim";
import { PROOF_STATUS } from "./enums";
import { dataOriginCol, pk } from "./shared-columns";

/** HumanOverride — 0..1 per Claim. Its `final_status` overlays the machine
 *  verdict in the effective-status resolver: `override.final_status ??
 *  machine_verdict` (AD-6). Operator-authored, with recorded responsibility. */
export const humanOverride = sqliteTable("human_override", {
  id: pk(),
  claimId: text("claim_id")
    .notNull()
    .unique()
    .references(() => claim.id),
  finalStatus: text("final_status", { enum: PROOF_STATUS }).notNull(),
  authoredBy: text("authored_by").notNull(),
  dataOrigin: dataOriginCol(),
});

/** Caveat — operator-authored, 1..* per Claim. Required for any effective-Yellow
 *  before it is report-includable; NEVER sourced from machine reasons — machine
 *  reasons live only in AuditResult.trace (AD-6). */
export const caveat = sqliteTable("caveat", {
  id: pk(),
  claimId: text("claim_id")
    .notNull()
    .references(() => claim.id),
  text: text("text").notNull(),
  authoredBy: text("authored_by").notNull(),
  dataOrigin: dataOriginCol(),
});
