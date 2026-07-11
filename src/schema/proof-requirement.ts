import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { deliverable } from "./deliverable";
import { CRITICALITY } from "./enums";
import { pk } from "./shared-columns";

/** ProofRequirement — one bar a Deliverable must clear. Its `criticality`
 *  (critical | supporting) drives the R/Y/G contract (AD-13/AD-19). The
 *  authored bar arrives in Epic 3; the column exists now. */
export const proofRequirement = sqliteTable("proof_requirement", {
  id: pk(),
  deliverableId: text("deliverable_id")
    .notNull()
    .references(() => deliverable.id),
  /** e.g. proof-of-posting, disclosure-visible, segment-proof. */
  kind: text("kind").notNull(),
  criticality: text("criticality", { enum: CRITICALITY }).notNull(),
  /** Human-readable requirement text shown in the Proof Brief (Story 3.2). It is
   *  DISPLAY-ONLY — it is NOT part of the AuditSnapshot, so a label edit is
   *  verdict-neutral and never invalidates an AuditResult cache. The `''` default
   *  keeps the additive migration safe on rows written before this column
   *  existed (mirrors match_suggestion.rule's default). */
  label: text("label").notNull().default(""),
});
