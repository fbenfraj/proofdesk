import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { campaign } from "./campaign";
import { EVIDENCE_LINK_SOURCE, INTAKE_KIND, LIVENESS_LABEL, MACHINE_OR_HUMAN } from "./enums";
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
  /** How this receipt was captured at ingest (Story 2.1). System-set from the
   *  intake surface; derives `machine_or_human` (AD-3/AD-19). NULL on the
   *  abstract Epic-1 seed rows, which predate the ingest path. */
  intakeKind: text("intake_kind", { enum: INTAKE_KIND }),
  /** The pasted link, for `url`-kind items. NULL otherwise. Story 2.4's
   *  SSRF-hardened link-checker reads this; Story 2.1 only stores it. */
  url: text("url"),
  /** Free-text paste (e.g. a Discord message), for `text`-kind items. */
  note: text("note"),
  /** S3-shaped object key into the `src/storage/` adapter, for file-kind items
   *  (`image`/`metric`). The bytes live in the storage adapter, never the DB. */
  storageKey: text("storage_key"),
  /** MIME type of the stored file (`image/png` | `image/jpeg` | `image/webp`). */
  contentType: text("content_type"),
  /** Original client filename, for display/download of file-kind items. */
  originalFilename: text("original_filename"),
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
  /** The deterministic rule that fired, e.g. `url:twitch.tv/pixelforge/…` or
   *  `handle:@pixelforge`. This is auditable PROVENANCE — it lets the operator
   *  inspect exactly why the match was suggested ("matched by URL pattern"). It
   *  is NOT a confidence/score/rank (there is deliberately none — AD-17). The
   *  `''` default keeps the additive migration safe on any DB that already holds
   *  match_suggestion rows (the matcher always writes a real rule at runtime). */
  rule: text("rule").notNull().default(""),
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
