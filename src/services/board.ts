// src/services/board — the Campaign Board view model (Story 1.6). Maps each
// ledger row to its display status WITHOUT running the audit: a Claim with no
// persisted AuditResult reads `pending`, so the board never triggers the
// recompute-and-persist path (that is Story 1.7's "Run Proof Audit"). Only when
// a result already exists does it read the AD-6 effective status through the ONE
// resolver (which also applies any Human override).

import { type BoardRow, type Db, listCampaignBoardRows } from "@/src/repositories";
import type { ProofStatus } from "@/src/schema";
import { readEffectiveStatus, resolveEffectiveStatus } from "./audit";

/** A row's status: `pending` before any audit has run, else the resolved
 *  effective Proof Status. `pending` is a UI state, NOT a ProofStatus — the
 *  domain enum never carries it. */
export type BoardRowStatus = { kind: "pending" } | { kind: "resolved"; status: ProofStatus };

export interface BoardRowView extends BoardRow {
  status: BoardRowStatus;
}

/**
 * Assemble the Campaign Board view model — strictly READ-ONLY. `readEffectiveStatus`
 * returns null when no AuditResult exists (`pending`), else the effective status
 * read off the PERSISTED verdict. It never recomputes or writes, so loading the
 * board never runs the audit — even if the cache is stale, that is refreshed only
 * by the explicit "Run Proof Audit" action (Story 1.7). The board is clock-free.
 */
export function getCampaignBoard(db: Db, campaignId: string): BoardRowView[] {
  return listCampaignBoardRows(db, campaignId).map((row) => {
    const effective = readEffectiveStatus(db, row.claimId);
    return effective
      ? { ...row, status: { kind: "resolved", status: effective.effectiveStatus } }
      : { ...row, status: { kind: "pending" } };
  });
}

/** The Proof-Readiness roll-up (FR-15): a Green/Yellow/Red count over the board's
 *  already-resolved effective statuses, plus the pending remainder. It is a PURE
 *  tally — it never runs the audit and holds no clock; the statuses it counts are
 *  whatever `getCampaignBoard` already read through the ONE resolver (AD-6), so
 *  the count is a projection of the persisted verdicts, never an independent
 *  recomputation. Presented as transparent counts (7·1·1), never an opaque score
 *  (AD-12). */
export interface ReadinessSummary {
  green: number;
  yellow: number;
  red: number;
  /** Rows with no persisted verdict yet (pre-audit). */
  pending: number;
  total: number;
}

export function summarizeReadiness(rows: BoardRowView[]): ReadinessSummary {
  const summary: ReadinessSummary = { green: 0, yellow: 0, red: 0, pending: 0, total: rows.length };
  for (const row of rows) {
    if (row.status.kind === "pending") summary.pending += 1;
    else summary[row.status.status] += 1;
  }
  return summary;
}

/** The one-round-trip payload the "Run Proof Audit" Route Handler returns. */
export interface CampaignAuditResult {
  rows: BoardRowView[];
  readiness: ReadinessSummary;
  /** Server-UTC ISO-8601 the run was stamped with (AD-11). */
  ranAt: string;
}

/**
 * The "Run Proof Audit" orchestration (Story 1.7) — the service the POST
 * Route Handler delegates to (AD-2: the route is thin, the service orchestrates).
 * This is a WRITE-capable path: it drives the ONE resolver over every Claim in
 * the campaign, which recomputes-and-persists each machine verdict when the
 * cache is stale (AD-4/AD-6). The verdict is never faked — the real engine runs
 * over the (seeded or real) inputs (AD-9). Re-reads the board afterward so the
 * returned rows reflect the freshly persisted results, and rolls them up for the
 * Proof-Readiness summary — all in one response so the client drives the reveal
 * without a second round-trip.
 *
 * @param now server-UTC ISO-8601 generated at the shell boundary (AD-11) — the
 *            only clock; never `Date.now()` below the shell.
 */
export function runCampaignAudit(db: Db, campaignId: string, now: string): CampaignAuditResult {
  for (const row of listCampaignBoardRows(db, campaignId)) {
    resolveEffectiveStatus(db, row.claimId, now);
  }
  const rows = getCampaignBoard(db, campaignId);
  return { rows, readiness: summarizeReadiness(rows), ranAt: now };
}
