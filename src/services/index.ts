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
