import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { MACHINE_OR_HUMAN } from "./enums";
import { evidenceLink } from "./evidence";
import { proofRequirement } from "./proof-requirement";
import { dataOriginCol, pk } from "./shared-columns";

/** HumanConfirmation — the append-only "page shows the Deliverable" record
 *  (AD-18). Written ONLY by an operator action and NEVER mutated by any machine
 *  re-check; a liveness re-check may invalidate the link but must not touch
 *  these rows. `machine_or_human` is fixed to `human` (default + repository
 *  guard). The snapshot assembler consumes it keyed to the ProofRequirement. */
export const humanConfirmation = sqliteTable("human_confirmation", {
  id: pk(),
  evidenceLinkId: text("evidence_link_id")
    .notNull()
    .references(() => evidenceLink.id),
  proofRequirementId: text("proof_requirement_id")
    .notNull()
    .references(() => proofRequirement.id),
  confirmedBy: text("confirmed_by").notNull(),
  /** UTC ISO-8601. */
  confirmedAt: text("confirmed_at").notNull(),
  /** Always `human` (AD-18). */
  machineOrHuman: text("machine_or_human", { enum: MACHINE_OR_HUMAN }).notNull().default("human"),
  dataOrigin: dataOriginCol(),
});
