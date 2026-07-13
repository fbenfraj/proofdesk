// src/services — orchestration (imperative shell). Home of the SOLE snapshot
// assembler (AD-16), the audit-run service, and the report assembler. Services
// orchestrate via repository / storage / verification adapters and the pure core;
// they never touch the DB driver, filesystem, or outbound HTTP directly (AD-2).
// Basic-auth helper: ./basic-auth.ts.

// The snapshot assembler + effective-status resolver (Story 1.5).
export * from "./audit";
// The Campaign Board view model (Story 1.6).
export * from "./board";
// Live-demo add-flow: scenario create, deliverable add, campaign list (Story AI-12).
export * from "./campaigns";
// The Claim Card drawer view model (Story 1.8).
export * from "./claim-card";
// Evidence Inbox ingest orchestration (Story 2.1).
export * from "./evidence-ingest";
// SSRF-hardened link-liveness check orchestration (Story 2.4).
export * from "./evidence-liveness";
// Deterministic Evidence→Deliverable matching + operator affirmation (Story 2.2).
export * from "./evidence-matching";
// "Page shows the Deliverable" HumanConfirmation write orchestration (Story 2.3).
export * from "./human-confirmation";
// Server-resolved operator display identity for attribution (Story 1.9).
export * from "./operator-identity";
// Override & caveat write orchestration (Story 1.9).
export * from "./override-caveat";
// Proof Brief template picker + per-Deliverable requirement authoring (Story 3.2).
export * from "./proof-brief";
// The report assembler + frozen-snapshot builder view + inclusion resolver (Story 4.1).
export * from "./report";
// The workflow-first stage-strip honest state (Story AI-10).
export * from "./stage-state";
