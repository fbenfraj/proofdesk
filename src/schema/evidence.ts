import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { campaign } from "./campaign";
import { EVIDENCE_LINK_SOURCE, LIVENESS_LABEL, MACHINE_OR_HUMAN } from "./enums";
import { proofRequirement } from "./proof-requirement";
import { dataOriginCol, pk } from "./shared-columns";

/** EvidenceItem — a raw receipt (link, screenshot, note, metric capture).
 *  `machine_or_human` is a first-class column, never a render-time decision
 *  (AD-3). `uploaded_at` is server-generated UTC at request receipt (AD-11);
 *  `client_captured_at` is optional and NEVER overrides the server value. */
export const evidenceItem = sqliteTable("evidence_item", {
  id: pk(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaign.id),
  type: text("type").notNull(),
  machineOrHuman: text("machine_or_human", { enum: MACHINE_OR_HUMAN }).notNull(),
  dataOrigin: dataOriginCol(),
  /** Server-authoritative UTC ISO-8601 (AD-11). */
  uploadedAt: text("uploaded_at").notNull(),
  /** Optional, clearly labelled; never overrides `uploaded_at` (AD-11). */
  clientCapturedAt: text("client_captured_at"),
  /** Last-known four-value liveness result for this receipt (AD-5, AD-7); NULL
   *  until a check has run. The Story-1.5 snapshot assembler maps it onto
   *  `AuditSnapshot.livenessLabel`; only `live` satisfies the reachability gate.
   *  Two writers already in sight (AD-10): the seed sets it now, the Epic-2
   *  SSRF-hardened link-checker (Story 2.4) sets it for real links later. */
  livenessLabel: text("liveness_label", { enum: LIVENESS_LABEL }),
});

/** MatchSuggestion — the rule-based matcher's output (Epic 2). Deterministic,
 *  with NO confidence score and NO ranking (AD-17). It NEVER enters the
 *  AuditSnapshot and can never lift a verdict; only an operator-affirmed
 *  EvidenceLink does. The core never sees suggestions. */
export const matchSuggestion = sqliteTable("match_suggestion", {
  id: pk(),
  evidenceItemId: text("evidence_item_id")
    .notNull()
    .references(() => evidenceItem.id),
  proofRequirementId: text("proof_requirement_id")
    .notNull()
    .references(() => proofRequirement.id),
  // Intentionally NO confidence / score / rank column (AD-17).
});

/** EvidenceLink — an operator-affirmed assertion that an EvidenceItem satisfies
 *  a ProofRequirement. `source` is `operator | suggested`; ONLY `operator`
 *  links enter the AuditSnapshot (AD-17). Inherits `data_origin` (AD-9). */
export const evidenceLink = sqliteTable("evidence_link", {
  id: pk(),
  evidenceItemId: text("evidence_item_id")
    .notNull()
    .references(() => evidenceItem.id),
  proofRequirementId: text("proof_requirement_id")
    .notNull()
    .references(() => proofRequirement.id),
  source: text("source", { enum: EVIDENCE_LINK_SOURCE }).notNull(),
  dataOrigin: dataOriginCol(),
});
