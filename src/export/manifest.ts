// src/export/manifest — the PURE proof-manifest builders (Story 4.4, FR-14,
// AD-12, NFR-D1). Two open-format renderings of the SAME row model: CSV (via
// `csv-stringify/sync`) and JSON. Both carry `machine_or_human` AND `data_origin`
// per exported receipt (NFR-D1, retro AI-4b/R2), reproduced VERBATIM — the
// manifest never re-derives provenance or origin at emit time (AD-3/AD-19/AD-9).
//
// PURE + deterministic, exactly like `report-html.ts`: imports nothing from
// `app/`, does no env / i18n / DB / fs / storage / Next access, no clock. It
// receives fully-resolved `ManifestRow[]` (the shell assembles them from the
// builder view) and returns a string. No fabricated statistic — only the passed
// stored values, honest and self-describing (NFR-D9).

import { stringify } from "csv-stringify/sync";
import type { DataOrigin, LivenessLabel, MachineOrHuman, ProofStatus } from "@/src/schema";

/** One row per EXPORTED receipt — the client-includable claim/evidence data,
 *  locale-neutral (the localized labels live in the HTML report; the manifest is
 *  data). Every value is a faithful stored value; nothing computed. */
export interface ManifestRow {
  /** Stable in-bundle reference (A1, A2, …) tying a receipt to its claim + the
   *  report HTML's "Receipts in Proof Appendix — A#" anchor. */
  claimRef: string;
  creatorName: string;
  /** The raw stored Deliverable type key (locale-neutral — the report HTML
   *  carries the localized label). */
  deliverableType: string;
  /** The claim's effective Proof Status (the domain string, AD-6). */
  proofStatus: ProofStatus;
  /** The claim's operator-authored Caveat text(s), verbatim. */
  caveats: string[];
  /** The EvidenceItem's operator-entered type label. */
  evidenceType: string;
  /** The receipt's source — url ?? original filename ?? note ?? evidence type. */
  evidenceSource: string;
  /** Machine-checked fact vs Human assertion — verbatim from the column (AD-3). */
  machineOrHuman: MachineOrHuman;
  /** `seeded | real`, inherited at the single derivation site (AD-9) — verbatim. */
  dataOrigin: DataOrigin;
  /** Link liveness where checked (AD-5); null otherwise. */
  livenessLabel: LivenessLabel | null;
  /** Server-authoritative UTC ISO-8601 `uploaded_at` (AD-11). */
  uploadedAt: string;
  /** The in-bundle path of this receipt's evidence file (`evidence/A#/…`) when its
   *  bytes were included, or null for a link/text receipt OR a file whose bytes
   *  were missing at export. Makes the row→file mapping explicit and honest — the
   *  recipient can tell a bundled file from a not-included one, never implied by
   *  order (a null under a file receipt says "not bundled", never fabricates one). */
  evidencePath: string | null;
}

/** Bumped only on a breaking manifest-shape change (NOT a per-export value — the
 *  builders are clock-free and deterministic). */
export const MANIFEST_VERSION = 1;

/** Separator for multi-caveat cells in the flat CSV (JSON keeps the array). */
const CAVEAT_SEP = " | ";

/** The manifest's canonical, ordered column set. Header names are snake_case per
 *  the manifest/export convention and carry the glossary terms verbatim
 *  (`machine_or_human`, `data_origin`). Order is fixed → deterministic output. */
const CSV_COLUMNS = [
  "claim_ref",
  "creator_name",
  "deliverable_type",
  "proof_status",
  "caveats",
  "evidence_type",
  "evidence_source",
  "machine_or_human",
  "data_origin",
  "liveness_label",
  "uploaded_at",
  "evidence_path",
] as const;

function toCsvRecord(row: ManifestRow): Record<(typeof CSV_COLUMNS)[number], string> {
  return {
    claim_ref: row.claimRef,
    creator_name: row.creatorName,
    deliverable_type: row.deliverableType,
    proof_status: row.proofStatus,
    caveats: row.caveats.join(CAVEAT_SEP),
    evidence_type: row.evidenceType,
    evidence_source: row.evidenceSource,
    machine_or_human: row.machineOrHuman,
    data_origin: row.dataOrigin,
    liveness_label: row.livenessLabel ?? "",
    uploaded_at: row.uploadedAt,
    evidence_path: row.evidencePath ?? "",
  };
}

/** The proof manifest as CSV — a header row + one row per receipt. `csv-stringify`
 *  quote-escapes any value containing `,` / `"` / newline, so the file is
 *  well-formed for spreadsheet import (AC2). Deterministic (same rows → identical
 *  string). Carries `machine_or_human` + `data_origin` columns. */
export function buildProofManifestCsv(rows: ManifestRow[]): string {
  return stringify(rows.map(toCsvRecord), {
    header: true,
    columns: CSV_COLUMNS as unknown as string[],
  });
}

/** The proof manifest as JSON — a small stable envelope + one object per receipt,
 *  each carrying `machine_or_human` + `data_origin` (AC2). `manifest_version` is a
 *  constant (not a timestamp — the builder is clock-free). Deterministic. */
export function buildProofManifestJson(rows: ManifestRow[]): string {
  return JSON.stringify(
    {
      manifest_version: MANIFEST_VERSION,
      generated_from: "evidence-snapshot",
      rows: rows.map((row) => ({
        claim_ref: row.claimRef,
        creator_name: row.creatorName,
        deliverable_type: row.deliverableType,
        proof_status: row.proofStatus,
        caveats: row.caveats,
        evidence_type: row.evidenceType,
        evidence_source: row.evidenceSource,
        machine_or_human: row.machineOrHuman,
        data_origin: row.dataOrigin,
        liveness_label: row.livenessLabel,
        uploaded_at: row.uploadedAt,
        evidence_path: row.evidencePath,
      })),
    },
    null,
    2,
  );
}
