// src/services — orchestration (imperative shell). Home of the SOLE snapshot
// assembler (AD-16), the audit-run service, and the report assembler. Services
// orchestrate via repository / storage / verification adapters and the pure core;
// they never touch the DB driver, filesystem, or outbound HTTP directly (AD-2).
// Basic-auth helper: ./basic-auth.ts.

// The snapshot assembler + effective-status resolver (Story 1.5).
export * from "./audit";
// The Campaign Board view model (Story 1.6).
export * from "./board";
// The Claim Card drawer view model (Story 1.8).
export * from "./claim-card";
// Evidence Inbox ingest orchestration (Story 2.1).
export * from "./evidence-ingest";
// Deterministic Evidence→Deliverable matching + operator affirmation (Story 2.2).
export * from "./evidence-matching";
// "Page shows the Deliverable" HumanConfirmation write orchestration (Story 2.3).
export * from "./human-confirmation";
// Server-resolved operator display identity for attribution (Story 1.9).
export * from "./operator-identity";
// Override & caveat write orchestration (Story 1.9).
export * from "./override-caveat";
