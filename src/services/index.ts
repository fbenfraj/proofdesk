// src/services — orchestration (imperative shell). Home of the SOLE snapshot
// assembler (AD-16), the audit-run service, and the report assembler. Services
// orchestrate via repository / storage / verification adapters and the pure core;
// they never touch the DB driver, filesystem, or outbound HTTP directly (AD-2).
// Domain services are filled in Stories 1.5+. Basic-auth helper: ./basic-auth.ts.
export {};
