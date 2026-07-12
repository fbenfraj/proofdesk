import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { deliverable } from "./deliverable";
import { CRITICALITY, DISCLOSURE_STATE } from "./enums";
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
  /** France/EU disclosure severity tier (Story 3.3, FR-4). Nullable: only
   *  `disclosure-visible` requirements ever carry a value, and even then it is
   *  null until the operator assesses the evidence on file (the core falls back
   *  to operator-confirmed evidence while null). UNLIKE `label`, this IS
   *  verdict-affecting — it flows into the AuditSnapshot, so setting/clearing it
   *  invalidates the AuditResult cache through evidence_snapshot_hash (AD-4). It
   *  is a Human assertion — no automated image recognition exists (AD-3) — never
   *  a compliance call. */
  disclosureState: text("disclosure_state", { enum: DISCLOSURE_STATE }),
  /** Stable France/EU disclosure-checklist identity (Story 3.3) — e.g.
   *  `collaboration-commerciale`. Set only for a checklist-attached disclosure;
   *  null otherwise. UNLIKE `label` (mutable display text) this is the immutable
   *  key the at-most-once guard and the localized row name both key off, so a
   *  label edit can never break dedup or de-localize the name. Plain text (not a
   *  DB enum) to avoid a schema→ruleset import cycle; the write path only ever
   *  stores a validated `FranceEuDisclosure` key. DISPLAY/identity-only — NOT in
   *  the AuditSnapshot, so it is verdict-neutral (never invalidates a cache). */
  disclosureKey: text("disclosure_key"),
});
