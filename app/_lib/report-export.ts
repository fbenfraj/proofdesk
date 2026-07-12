// app/_lib/report-export — the SHELL assembler for the portable ZIP export
// (Story 4.4, FR-14, AD-9/AD-12, NFR-D4). Every IMPURE edge lives here: reading
// the campaign's immutable `is_demo`/`name`, reading the frozen builder view,
// reading evidence bytes from the storage adapter, deriving the download
// filename, and — first of all — enforcing the seeded/real EXPORT HARD-WALL.
//
// It composes the PURE builders (`src/export`: the 4.3 document render, the 4.4
// manifest + ZIP builders) over a fully-resolved model, keeping every policy
// decision (what ships, what's walled) in one honest place:
//
//   1. is_demo → the wall fires BEFORE anything is assembled (a demo never
//      produces a downloadable client bundle, AD-9). No bytes.
//   2. no report → nothing to export.
//   3. stale → refuse (recompute-or-refuse, never a silent stale green — AI-3);
//      the operator freezes a fresh version first.
//   4. otherwise → the ZIP: report.html (the 4.3 artifact) + evidence files +
//      manifest.csv + manifest.json, over the SAME includable set the HTML uses.

import {
  type BundleFile,
  buildProofManifestCsv,
  buildProofManifestJson,
  buildReportBundle,
  type ManifestRow,
  renderReportDocument,
} from "@/src/export";
import { type Db, getCampaign } from "@/src/repositories";
import { getLatestReportBuilderView } from "@/src/services";
import type { Locale } from "./i18n";
import { composeReportBranding } from "./report-branding";
import { buildReportDocumentModel, selectIncludableClaims } from "./report-document";

type Storage = { get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> };

/** The download outcome — a discriminated union so the route maps each honest
 *  state to a status code without leaking policy into the handler. */
export type ReportDownloadResult =
  | { kind: "ok"; filename: string; bytes: Uint8Array }
  /** `is_demo = true` — export is walled (AD-9); no bytes are ever produced. */
  | { kind: "demo" }
  /** The report is stale — refuse rather than ship a withheld/empty bundle (AI-3). */
  | { kind: "stale" }
  /** No report exists for this campaign yet. */
  | { kind: "none" };

/** Filesystem-safe slug (NFKD → drop accents/punctuation → single hyphens). Same
 *  discipline as the report-ref slug; ASCII-only so the download filename is safe
 *  in a `Content-Disposition` header and on every OS. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "report"
  );
}

/** Meaningful, deterministic bundle filename from real data (AD-11 — the version
 *  is the persisted report version, no client clock, no invented id). e.g.
 *  `studio-kairos_proof-of-performance_lumen-q3-v2.zip`. */
function bundleFilename(agencyName: string, campaignName: string, version: number): string {
  return `${slugify(agencyName)}_proof-of-performance_${slugify(campaignName)}-v${version}.zip`;
}

/** A safe in-ZIP basename for an evidence file — never a path, never traversal. */
function evidenceBasename(originalFilename: string | null, storageKey: string): string {
  const raw = originalFilename ?? storageKey.split("/").pop() ?? "evidence";
  // Collapse anything path-ish / unsafe to a flat, portable name.
  return raw.replace(/[/\\]+/g, "-").replace(/[^a-zA-Z0-9._-]+/g, "_") || "evidence";
}

/**
 * Assemble the downloadable bundle for a Campaign's latest report — or a walled /
 * empty / stale signal. The demo hard-wall is checked FIRST, before any assembly,
 * so a seeded demo can never leave the building as a clean client bundle (AD-9).
 */
export async function buildReportDownload(
  db: Db,
  storage: Storage,
  campaignId: string,
  locale: Locale,
): Promise<ReportDownloadResult> {
  const campaign = getCampaign(db, campaignId);
  // (1) THE HARD-WALL — first, before assembling anything (AD-9, NFR-D6).
  if (campaign?.isDemo) return { kind: "demo" };

  const view = getLatestReportBuilderView(db, campaignId);
  if (!view) return { kind: "none" };
  // (3) recompute-or-refuse — never export a withheld/empty stale split (AI-3).
  if (view.stale) return { kind: "stale" };

  const campaignName = campaign?.name ?? "";
  const branding = composeReportBranding(locale, view.bylineRemoved);

  // The ONE definition of "what ships" — shared with the HTML render so the
  // manifest and the document describe exactly the same claims (AD-21/FR-13).
  const includable = selectIncludableClaims(view);

  // The report.html bundle entry IS the 4.3 artifact — never re-implemented. A
  // real campaign → isDemo=false → no SAMPLE marker in the exported document.
  const model = await buildReportDocumentModel(storage, view, campaignName, locale, false);
  const reportHtml = renderReportDocument(model);

  // Manifest rows + evidence files, over the includable set. Refs A1, A2, … match
  // the document's appendix anchors. Provenance + data_origin travel VERBATIM.
  const rows: ManifestRow[] = [];
  const evidenceFiles: BundleFile[] = [];
  for (let i = 0; i < includable.length; i++) {
    const { item, entry } = includable[i];
    const claimRef = `A${i + 1}`;
    for (let r = 0; r < entry.receipts.length; r++) {
      const receipt = entry.receipts[r];
      // Resolve the file FIRST so the manifest row can name its exact in-bundle
      // path (or null when there is no file / the bytes were missing) — the
      // row→file mapping is explicit, never implied by order (Codex review).
      let evidencePath: string | null = null;
      if (receipt.storageKey) {
        const file = await storage.get(receipt.storageKey);
        // Guard a missing file — skip it, never crash, never fabricate one; the
        // row still records the receipt with a null path (honestly "not bundled").
        if (file) {
          const name = evidenceBasename(receipt.originalFilename, receipt.storageKey);
          evidencePath = `evidence/${claimRef}/r${r + 1}-${name}`;
          evidenceFiles.push({ path: evidencePath, bytes: file.bytes });
        }
      }
      rows.push({
        claimRef,
        creatorName: item.creatorName,
        deliverableType: item.deliverableType,
        proofStatus: item.effectiveStatus,
        caveats: item.caveats,
        evidenceType: receipt.evidenceType,
        evidenceSource:
          receipt.url ?? receipt.originalFilename ?? receipt.note ?? receipt.evidenceType,
        machineOrHuman: receipt.provenance,
        dataOrigin: receipt.dataOrigin,
        livenessLabel: receipt.livenessLabel,
        uploadedAt: receipt.timestamp,
        evidencePath,
      });
    }
  }

  const files: BundleFile[] = [
    { path: "report.html", bytes: new TextEncoder().encode(reportHtml) },
    { path: "manifest.csv", bytes: new TextEncoder().encode(buildProofManifestCsv(rows)) },
    { path: "manifest.json", bytes: new TextEncoder().encode(buildProofManifestJson(rows)) },
    ...evidenceFiles,
  ];

  return {
    kind: "ok",
    filename: bundleFilename(branding.agencyName, campaignName, view.version),
    bytes: buildReportBundle(files),
  };
}
