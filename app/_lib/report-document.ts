// app/_lib/report-document — the SHELL assembler for the Client-Safe Report
// document (Story 4.3, FR-14, AD-12). This is where every IMPURE edge lives —
// reading the builder view, reading evidence bytes from storage and base64-
// inlining them, resolving i18n strings, injecting the design-token colours/
// glyphs, composing white-label branding. It hands a fully-resolved
// `ReportDocumentModel` to the PURE `renderReportDocument` (src/export), keeping
// presentation policy in the presentation layer (AD-2) and the renderer pure.
//
// No status/provenance is ever re-derived here: provenance is reproduced verbatim
// from the builder view's receipts (AD-3/AD-19), Red/internal-only claims are
// already withheld upstream, and a stale report already arrives with no
// clientVisible/appendix — the model then renders the calm withheld state (AC6).

import {
  PROOF_STATUS_TOKENS,
  PROVENANCE_TOKENS,
  type ProofStatusToken,
  STATUS_ORDER,
} from "@/app/_lib/design-tokens";
import { proofStatusToDisplayKey } from "@/app/_lib/proof-status";
import {
  type ReportDocumentAppendixClaim,
  type ReportDocumentClaim,
  type ReportDocumentModel,
  type ReportDocumentReceipt,
  type ReportReceiptValue,
  renderReportDocument,
} from "@/src/export";
import { type Db, getCampaign } from "@/src/repositories";
import {
  type AppendixReceipt,
  getLatestReportBuilderView,
  type ReportBuilderView,
  type ReportItemView,
} from "@/src/services";
import { type DeliverableTypeKey, type Locale, localeStrings, type Strings } from "./i18n";
import { composeReportBranding } from "./report-branding";

type Storage = { get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> };

/** Localize a Deliverable type via the canonical template-name map, falling back
 *  to the raw stored value for any non-template type (never a crash, never a
 *  fabricated label). */
function deliverableTypeLabel(strings: Strings, type: string): string {
  return strings.proofBrief.templateName[type as DeliverableTypeKey] ?? type;
}

/** Inject a status's 3-channel presentation from the single-source design tokens
 *  (colours never re-typed as literals — the drift guard asserts this). */
function statusPresentation(status: ReportItemView["effectiveStatus"], locale: Locale) {
  const token: ProofStatusToken = PROOF_STATUS_TOKENS[proofStatusToDisplayKey(status)];
  return {
    glyph: token.glyph,
    label: locale === "fr" ? token.labelFr : token.labelEn,
    ink: token.ink,
    fill: token.fill,
    border: token.border,
  };
}

/** Pick the render shape for a receipt from its stored content, faithfully:
 *  a base64-inlined screenshot (image content-type + bytes on file), else a link,
 *  else a text note, else the type label as plain text. Provenance is NOT decided
 *  here — it travels verbatim from the column (AD-3/AD-19). */
async function receiptValue(storage: Storage, r: AppendixReceipt): Promise<ReportReceiptValue> {
  if (r.storageKey && r.contentType?.startsWith("image/")) {
    const file = await storage.get(r.storageKey);
    if (file) {
      const base64 = Buffer.from(file.bytes).toString("base64");
      return {
        kind: "image",
        dataUri: `data:${file.contentType};base64,${base64}`,
        alt: r.originalFilename ?? r.evidenceType,
      };
    }
    // Missing file → do not crash and do not fabricate an image; fall through to
    // the best available textual content.
  }
  if (r.url) return { kind: "link", url: r.url };
  if (r.note) return { kind: "text", text: r.note };
  return { kind: "text", text: r.evidenceType };
}

async function appendixReceipt(
  storage: Storage,
  strings: Strings,
  r: AppendixReceipt,
): Promise<ReportDocumentReceipt> {
  const prov = PROVENANCE_TOKENS[r.provenance];
  return {
    kindLabel: r.evidenceType,
    provenance: {
      glyph: prov.glyph,
      label: strings.drawer.provenance[r.provenance],
      ink: prov.ink,
      bg: prov.bg,
    },
    value: await receiptValue(storage, r),
    // Liveness is a link-receipt concern; the stamp + caveat line are localized.
    livenessStamp: r.livenessLabel ? strings.report.livenessStamp(r.livenessLabel) : null,
    livenessNote: r.livenessLabel ? strings.drawer.liveness[r.livenessLabel] : null,
    timestamp: r.timestamp,
  };
}

/** Deterministic, meaningful report reference from real data — no invented
 *  external id. e.g. "Lumen × Twitch Sprint" v2 → "lumen-twitch-sprint-v2". */
function reportRef(campaignName: string, version: number): string {
  // NFKD decomposes accents to base-letter + combining mark; the non-alphanumeric
  // pass then drops the marks (and any punctuation/whitespace) to single hyphens.
  const slug =
    campaignName
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "report";
  return `${slug}-v${version}`;
}

/**
 * Build the fully-resolved document model from a builder view (Story 4.3).
 * `storage` is injected so tests can supply a fake and the route/page pass the
 * real disk adapter. Async only because screenshot receipts are base64-inlined.
 */
export async function buildReportDocumentModel(
  storage: Storage,
  view: ReportBuilderView,
  campaignName: string,
  locale: Locale,
): Promise<ReportDocumentModel> {
  const strings = localeStrings(locale);
  const branding = composeReportBranding(locale, view.bylineRemoved);
  const ref = reportRef(campaignName, view.version);

  // The client document ships a claim only when it is FULLY client-includable —
  // it must NOT still require a Caveat (an effective-Yellow with no operator Caveat
  // is not yet includable, AD-6) AND it must carry ≥1 receipt (FR-13 — a client
  // report never overstates "backed by receipts" for a claim with none). Either gap
  // withholds the claim from the CLIENT artifact while the operator still sees it in
  // the builder (requiresCaveat / missingReceipt) — surfaced, never silently
  // shipped, and never rendered as backed when it is not. This makes the summary /
  // appendix "each backed by receipts" copy true by construction (retro AI-3:
  // make the dishonest state unrepresentable). `clientVisible` and `appendix` are
  // index-aligned (the service maps the appendix from the same list), so
  // pair-then-filter keeps the appendix in lockstep with the claims.
  const includable = view.clientVisible
    .map((item, i) => ({ item, entry: view.appendix[i] }))
    .filter(({ item, entry }) => !item.requiresCaveat && !entry.missingReceipt);

  // Refs A1, A2, … over the includable list; the appendix follows the same order.
  const claims: ReportDocumentClaim[] = includable.map(({ item }, i) => ({
    ref: `A${i + 1}`,
    creatorName: item.creatorName,
    deliverableType: deliverableTypeLabel(strings, item.deliverableType),
    status: statusPresentation(item.effectiveStatus, locale),
    caveats: item.caveats,
    receiptRefLabel: strings.report.receiptRef(`A${i + 1}`),
  }));

  const appendix: ReportDocumentAppendixClaim[] = await Promise.all(
    includable.map(async ({ item, entry }, i) => ({
      ref: `A${i + 1}`,
      creatorName: entry.creatorName,
      deliverableType: deliverableTypeLabel(strings, entry.deliverableType),
      status: statusPresentation(item.effectiveStatus, locale),
      receipts: await Promise.all(entry.receipts.map((r) => appendixReceipt(storage, strings, r))),
    })),
  );

  // Honest counts only — the number of INCLUDABLE claims per status, over ALL
  // statuses in the canonical order so the summary always matches the body. A
  // client doc is normally Green/Caveated, but an operator can override-include a
  // Red claim with recorded responsibility (AD-21); when one is in the document it
  // MUST be counted here too, or the summary would undercount the body. Never a
  // percentage, score, or invented figure (NFR-D9) — just counts of what ships.
  const summaryCounts = STATUS_ORDER.map((key) => {
    const token = PROOF_STATUS_TOKENS[key];
    const count = includable.filter(
      ({ item }) => proofStatusToDisplayKey(item.effectiveStatus) === key,
    ).length;
    return {
      glyph: token.glyph,
      label: locale === "fr" ? token.labelFr : token.labelEn,
      ink: token.ink,
      count,
    };
  }).filter((c) => c.count > 0);

  // The withheld/empty state: a stale report arrives with no clientVisible split
  // (AC6 — the withheld state), and a report with no INCLUDABLE claims (all Red, or
  // Yellow still awaiting caveats) presents nothing to the client. Both render a
  // calm honest note, never a broken shell.
  const emptyStateNote = view.stale
    ? strings.report.emptyStale
    : includable.length === 0
      ? strings.report.emptyNoClaims
      : null;

  return {
    htmlLang: locale,
    title: campaignName,
    kicker: strings.report.kicker,
    agencyName: branding.agencyName,
    agencyLogoDataUri: branding.agencyLogo,
    byline: branding.byline,
    reportRef: ref,
    refLabel: strings.report.refLabel,
    issuedDate: view.createdAt,
    issuedLabel: strings.report.issuedLabel,
    summaryCaption: strings.report.summaryCaption,
    summaryCounts,
    summaryTotal: strings.report.summaryTotal(includable.length),
    claimsHeading: strings.report.claimsHeading,
    appendixHeading: strings.report.appendixHeading,
    appendixNote: strings.report.appendixNote,
    caveatLabel: strings.report.caveatLabel,
    claims: emptyStateNote ? [] : claims,
    appendix: emptyStateNote ? [] : appendix,
    emptyStateNote,
    trustEuLabel: strings.report.trustEu,
    trustLegal: strings.legalDisclaimer,
    trustExportLabel: strings.report.trustExport,
    trustAttribution: strings.report.attribution(branding.agencyName, ref),
  };
}

/**
 * Assemble + render the latest Client-Safe Report document for a Campaign, or
 * null when the campaign has no report yet (→ the route 404s, the page shows an
 * empty state). Shared by the `report/document` route and the builder page so the
 * on-screen preview and the served artifact are byte-identical.
 *
 * The demo `SAMPLE` badge + `is_demo` export hard-wall + download are Story 4.4;
 * this returns the on-screen document only (AD-9 permits the demo on-screen view).
 */
export async function assembleReportDocumentHtml(
  db: Db,
  storage: Storage,
  campaignId: string,
  locale: Locale,
): Promise<string | null> {
  const view = getLatestReportBuilderView(db, campaignId);
  if (!view) return null;
  const campaign = getCampaign(db, campaignId);
  const campaignName = campaign?.name ?? "";
  const model = await buildReportDocumentModel(storage, view, campaignName, locale);
  return renderReportDocument(model);
}
