// src/schema — Drizzle table definitions + Zod validators, sharing the glossary
// vocabulary (AD-3), plus the versioned AuditSnapshot contract (AD-16). Table
// definitions and types only; the connection/driver lives in src/repositories
// (AD-10). Authored in Story 1.3.

export * from "./audit-result";

// The frozen core/shell contract.
export * from "./audit-snapshot";
export * from "./campaign";
export * from "./claim";
// Entities (15) — dependency order.
export * from "./client";
export * from "./creator";
export * from "./deliverable";
// Canonical enums (single source of truth) + Zod schemas.
export * from "./enums";
export * from "./evidence";
export * from "./human-confirmation";
export * from "./override-caveat";
export * from "./proof-requirement";
export * from "./report";
