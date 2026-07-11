// src/services/hash — the one canonical hash used for AuditResult cache identity
// (AD-4). Lives in the shell (it imports node:crypto, so it may NOT live in the
// pure `src/ruleset`/`src/core`, AD-2). Shared so the override seam's hash and
// the resolver's hash are provably the SAME function.

import { createHash } from "node:crypto";

/** Deterministic SHA-256 over a canonical JSON serialization. Callers build
 *  objects with stable key order and sorted arrays, so JSON.stringify is
 *  canonical here. */
export function hashObject(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
