// Canonical domain enums — the SINGLE SOURCE OF TRUTH (Story 1.3, Task 2).
//
// Both the Drizzle column enums and the Zod schemas below derive from these
// `as const` arrays; never re-type the members anywhere else. A drift-guard
// test (tests/audit-snapshot.test.ts) asserts the mapping to the UI display
// labels stays total. Presentation labels (defensible / caveated / cant-claim)
// live in `app/_lib/design-tokens.ts` — the UI layer — NOT here (AD-2: the
// domain layer carries no presentation concern).

import { z } from "zod";

/** Proof Status — the domain verdict (glossary: "Proof Status"). R/Y/G. */
export const PROOF_STATUS = ["green", "yellow", "red"] as const;
export type ProofStatus = (typeof PROOF_STATUS)[number];

/** Link liveness — four-value taxonomy owned by the verification adapter (AD-7).
 *  `blocked` ≠ `dead`; only `live` satisfies the reachability gate (AD-5). */
export const LIVENESS_LABEL = ["live", "dead", "blocked", "unresolved"] as const;
export type LivenessLabel = (typeof LIVENESS_LABEL)[number];

/** Provenance — first-class on EvidenceItem, HumanConfirmation, trace (AD-3). */
export const MACHINE_OR_HUMAN = ["machine", "human"] as const;
export type MachineOrHuman = (typeof MACHINE_OR_HUMAN)[number];

/** ProofRequirement criticality (AD-13/AD-19). */
export const CRITICALITY = ["critical", "supporting"] as const;
export type Criticality = (typeof CRITICALITY)[number];

/** Seeded/real hard wall — immutable on Campaign, inherited on children (AD-9). */
export const DATA_ORIGIN = ["seeded", "real"] as const;
export type DataOrigin = (typeof DATA_ORIGIN)[number];

/** EvidenceLink source — only `operator` links enter the AuditSnapshot (AD-17). */
export const EVIDENCE_LINK_SOURCE = ["operator", "suggested"] as const;
export type EvidenceLinkSource = (typeof EVIDENCE_LINK_SOURCE)[number];

/** How an EvidenceItem was captured at ingest (Story 2.1). System-set, never
 *  operator-editable (the operator edits the free-text `type` label instead).
 *  This is the rule that derives `machine_or_human` (AD-3/AD-19): `url` →
 *  `machine` (its liveness is machine-checkable — the actual check is Story 2.4);
 *  `image`/`text`/`metric` → `human` (a screenshot, a pasted note and a metric
 *  capture are never machine-verified). Drives which content column is used. */
export const INTAKE_KIND = ["url", "image", "text", "metric"] as const;
export type IntakeKind = (typeof INTAKE_KIND)[number];

/** ReportItem audience split — Red is internal_only (AD-21). */
export const REPORT_ITEM_AUDIENCE = ["client_visible", "internal_only"] as const;
export type ReportItemAudience = (typeof REPORT_ITEM_AUDIENCE)[number];

// Zod schemas derived from the same const arrays (parse-don't-validate at Route
// Handler boundaries in later stories, AD-8). Never re-list the members.
export const proofStatusSchema = z.enum(PROOF_STATUS);
export const livenessLabelSchema = z.enum(LIVENESS_LABEL);
export const machineOrHumanSchema = z.enum(MACHINE_OR_HUMAN);
export const criticalitySchema = z.enum(CRITICALITY);
export const dataOriginSchema = z.enum(DATA_ORIGIN);
export const evidenceLinkSourceSchema = z.enum(EVIDENCE_LINK_SOURCE);
export const reportItemAudienceSchema = z.enum(REPORT_ITEM_AUDIENCE);
export const intakeKindSchema = z.enum(INTAKE_KIND);
