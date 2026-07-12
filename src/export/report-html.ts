// src/export/report-html — the self-contained Client-Safe Report document
// renderer (Story 4.3, FR-14, AD-12/AD-22). PURE by construction: it imports
// nothing from `app/`, touches no env / i18n / DB / filesystem / Next, and calls
// no clock — it receives a fully-resolved `ReportDocumentModel` and returns one
// self-contained HTML string. This mirrors how `src/core` stays pure by consuming
// a pre-assembled snapshot: every presentation value (localized strings, status/
// provenance colours + glyphs, base64 screenshots) is INJECTED by the shell
// (`app/_lib/report-document.ts`), so this module carries no presentation policy,
// only presentation mechanics.
//
// The output is a single document: inline `<style>` only, screenshots as base64
// `data:` URIs, ZERO external CSS/JS/font/network references — it renders opened
// as a file with no ProofDesk running (AD-12). Print/Save-as-PDF is the only PDF
// path; the print stylesheet forces `print-color-adjust: exact`. Every R/Y/G
// status shows on three channels — colour + text label + shape glyph — so it
// survives grayscale and colourblindness (AD-12). All interpolated user data is
// HTML-escaped (a self-contained document opened in a browser must be XSS-safe).

/** Injected 3-channel status presentation (colour + label + glyph). Colours come
 *  from `PROOF_STATUS_TOKENS` at the shell — never hardcoded here (drift guard). */
export interface ReportDocumentStatus {
  /** Shape glyph — the colour-independent channel (`●` / `◐` / `▲`). */
  glyph: string;
  /** Localized uppercase stamp label (e.g. DEFENSIBLE / DÉFENDABLE). */
  label: string;
  ink: string;
  fill: string;
  border: string;
}

/** Injected provenance chip presentation (cool machine / warm human), kept OFF
 *  the R/Y/G scale (AD-3). Reproduced verbatim from the stored provenance. */
export interface ReportDocumentProvenance {
  glyph: string;
  label: string;
  ink: string;
  bg: string;
}

/** A receipt's renderable value — the shell picks exactly one shape from the
 *  stored evidence content. Live text always (never rasterized), except a
 *  screenshot which is the one legitimate `<img>` (with a meaningful alt). */
export type ReportReceiptValue =
  | { kind: "link"; url: string }
  | { kind: "text"; text: string }
  | { kind: "image"; dataUri: string; alt: string };

export interface ReportDocumentReceipt {
  /** The evidence type label (user data — escaped). */
  kindLabel: string;
  provenance: ReportDocumentProvenance;
  value: ReportReceiptValue;
  /** Liveness stamp text (e.g. "LIVENESS: LIVE") or null for non-link receipts. */
  livenessStamp: string | null;
  /** The liveness caveat line (e.g. "link resolves — content not verified"). */
  livenessNote: string | null;
  /** Mono server-UTC timestamp line (pre-formatted at the shell, AD-11). */
  timestamp: string;
}

export interface ReportDocumentAppendixClaim {
  /** Cross-reference to the claims section (e.g. "A1"). */
  ref: string;
  creatorName: string;
  deliverableType: string;
  status: ReportDocumentStatus;
  /** ≥1 receipt always — a client-visible claim with zero receipts is withheld from
   *  the client document by the shell assembler (FR-13), never shipped unbacked. */
  receipts: ReportDocumentReceipt[];
}

export interface ReportDocumentClaim {
  ref: string;
  creatorName: string;
  deliverableType: string;
  status: ReportDocumentStatus;
  /** Operator-authored caveat text(s) — a Caveated claim always carries ≥1. */
  caveats: string[];
  /** Localized "Receipts in Proof Appendix — A1" reference line. */
  receiptRefLabel: string;
}

export interface ReportDocumentSummaryCount {
  glyph: string;
  label: string;
  ink: string;
  count: number;
}

export interface ReportDocumentModel {
  /** `en` | `fr` — drives `<html lang>` and the caveat `lang="fr"` wrapping. */
  htmlLang: string;
  /** Document `<title>` + the report `<h1>` (campaign name). */
  title: string;
  kicker: string;
  /** The demo `SAMPLE` honesty marker, localized ("SAMPLE" / "EXEMPLE"), or null
   *  for a real campaign. When present the document renders a prominent,
   *  print-surviving, grayscale-legible banner so any Print/Save-as-PDF a demo
   *  produces is unmistakably a sample and never passed off as a clean client
   *  report (AD-9, Story 4.4). Additive — it never relaxes the other honesty
   *  invariants (Red still absent, stale still withheld, provenance verbatim). */
  sampleBadge: string | null;
  agencyName: string;
  /** Optional agency logo as a base64 `data:` URI; null → name-only header. */
  agencyLogoDataUri: string | null;
  /** "Prepared by [Agency] · Proof audit by ProofDesk"; null when removed. */
  byline: string | null;
  reportRef: string;
  refLabel: string;
  issuedDate: string;
  issuedLabel: string;
  summaryCaption: string;
  summaryCounts: ReportDocumentSummaryCount[];
  summaryTotal: string;
  claimsHeading: string;
  appendixHeading: string;
  appendixNote: string;
  /** Localized "Caveat" label prefixing each rendered caveat (EN "Caveat" /
   *  FR "Réserve") — injected so the pure renderer stays locale-agnostic. */
  caveatLabel: string;
  claims: ReportDocumentClaim[];
  appendix: ReportDocumentAppendixClaim[];
  /** Shown in place of the claims/appendix when there is nothing to present
   *  (no report yet, or a stale report whose split is withheld — AC6). Null when
   *  claims are present. */
  emptyStateNote: string | null;
  trustEuLabel: string;
  /** The legal disclaimer, verbatim (AD-22) — reused from i18n, not re-authored. */
  trustLegal: string;
  trustExportLabel: string;
  trustAttribution: string;
}

/** HTML-escape every interpolated value. A self-contained document opened in a
 *  browser must be XSS-safe and must not break on `<`/`>`/`&`/`"`/`'` inside user
 *  data (caveats, notes, URLs, names). Applied to ALL dynamic strings. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Wrap the locked FR term "collaboration commerciale" in `lang="fr"` wherever it
 *  appears (so a screen reader on an EN surface pronounces it correctly, UX-DR). */
function markFrenchTerms(escaped: string): string {
  return escaped.replace(
    /collaboration commerciale/g,
    '<span lang="fr">collaboration commerciale</span>',
  );
}

/** A 3-channel status stamp: glyph + uppercase label + colour, together. Grayscale
 *  keeps glyph + label. `role="img"` + `aria-label` so it reads as one unit. */
function statusStamp(status: ReportDocumentStatus): string {
  const label = escapeHtml(status.label);
  return (
    `<span class="stamp" role="img" aria-label="${label}"` +
    ` style="color:${status.ink};border-color:${status.border};background:${status.fill}">` +
    `<span class="glyph" aria-hidden="true">${escapeHtml(status.glyph)}</span>${label}</span>`
  );
}

/** A provenance chip: glyph + label, cool/warm, never colour-alone. */
function provenanceChip(p: ReportDocumentProvenance): string {
  return (
    `<span class="chip" style="color:${p.ink};background:${p.bg}">` +
    `<span class="pglyph" aria-hidden="true">${escapeHtml(p.glyph)}</span>${escapeHtml(p.label)}</span>`
  );
}

function receiptValueHtml(value: ReportReceiptValue): string {
  switch (value.kind) {
    case "link":
      // The URL is shown as live text (never a live anchor that could smuggle a
      // handler); it is escaped and mono-styled.
      return `<span class="r-link">${escapeHtml(value.url)}</span>`;
    case "text":
      return `<span class="r-text">${markFrenchTerms(escapeHtml(value.text))}</span>`;
    case "image":
      // The ONE legitimate image — an operator-uploaded screenshot, base64-inlined,
      // with a meaningful alt (never rasterized text).
      return `<img class="r-img" src="${escapeHtml(value.dataUri)}" alt="${escapeHtml(value.alt)}" />`;
  }
}

function receiptHtml(r: ReportDocumentReceipt): string {
  const foot: string[] = [provenanceChip(r.provenance)];
  if (r.livenessStamp) {
    foot.push(`<span class="liveness">${escapeHtml(r.livenessStamp)}</span>`);
  }
  foot.push(`<span class="ts">${escapeHtml(r.timestamp)}</span>`);
  const note = r.livenessNote ? `<dd class="r-note">${escapeHtml(r.livenessNote)}</dd>` : "";
  return (
    `<div class="receipt">` +
    `<dt class="r-kind">${escapeHtml(r.kindLabel)}</dt>` +
    `<dd class="r-value">${receiptValueHtml(r.value)}</dd>` +
    `<dd class="r-foot">${foot.join("")}</dd>` +
    note +
    `</div>`
  );
}

function claimHtml(c: ReportDocumentClaim, caveatLabel: string): string {
  const label = escapeHtml(caveatLabel);
  const caveats = c.caveats
    .map(
      (text) =>
        `<div class="caveat"><span class="caveat-label">${label}</span>` +
        `<span class="caveat-text">${markFrenchTerms(escapeHtml(text))}</span></div>`,
    )
    .join("");
  return (
    `<article class="claim">` +
    `<div class="claim-top">` +
    `<span class="claim-title"><span class="who">${escapeHtml(c.creatorName)}</span> · ${escapeHtml(c.deliverableType)}</span>` +
    statusStamp(c.status) +
    `</div>` +
    caveats +
    `<p class="receipt-ref">${escapeHtml(c.receiptRefLabel)}</p>` +
    `</article>`
  );
}

function appendixClaimHtml(a: ReportDocumentAppendixClaim): string {
  const receipts = a.receipts.map(receiptHtml).join("");
  return (
    `<section class="apx-claim">` +
    `<div class="apx-head">` +
    `<span class="apx-title"><span class="ref">${escapeHtml(a.ref)}</span> · <span class="who">${escapeHtml(a.creatorName)}</span> · ${escapeHtml(a.deliverableType)}</span>` +
    statusStamp(a.status) +
    `</div>` +
    `<dl class="receipts">${receipts}</dl>` +
    `</section>`
  );
}

function summaryHtml(model: ReportDocumentModel): string {
  const counts = model.summaryCounts
    .map(
      (s) =>
        `<span class="s-count" style="color:${s.ink}">` +
        `<span class="glyph" aria-hidden="true">${escapeHtml(s.glyph)}</span>` +
        `<span class="s-n">${s.count}</span> <span class="s-label">${escapeHtml(s.label)}</span></span>`,
    )
    .join("");
  return (
    `<div class="summary">` +
    `<span class="s-cap">${escapeHtml(model.summaryCaption)}</span>` +
    `<div class="s-counts">${counts}</div>` +
    `<span class="s-total">${escapeHtml(model.summaryTotal)}</span>` +
    `</div>`
  );
}

/** The inline stylesheet — document register (cream paper, serif record voice),
 *  centered ~860px page, with a `@media print` block that forces colour fills and
 *  avoids splitting claims/receipts across pages. Colour is never the sole status
 *  channel, so grayscale print stays legible via glyph + label. */
const STYLE = `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:#DED6C3;color:#1E1B14;font-family:Georgia,'Times New Roman',serif;line-height:1.5;padding:28px 16px}
.page{max-width:860px;margin:0 auto;background:#FCFBF7;border:1px solid #D8CEB6;border-radius:4px;box-shadow:0 10px 34px rgba(30,27,20,.16);padding:48px 56px 36px}
.sample{margin:-8px 0 22px;background:#7A3E2E;color:#FCFBF7;border:2px solid #5c2c20;border-radius:4px;padding:9px 14px;text-align:center;font-family:system-ui,-apple-system,sans-serif;font-size:13px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.rpt-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:18px;border-bottom:2px solid #7A3E2E;margin-bottom:6px}
.lockup{display:flex;align-items:center;gap:12px}
.lockup img{width:40px;height:40px;object-fit:contain;flex-shrink:0}
.agency{font-size:21px;font-weight:600;letter-spacing:.3px}
.rpt-meta{text-align:right;font-family:system-ui,-apple-system,sans-serif;font-size:11px;color:#6B6355;line-height:1.7}
.rpt-meta .val{font-family:ui-monospace,Menlo,monospace;color:#1E1B14}
.title-block{margin:20px 0 4px}
.kicker{font-family:system-ui,sans-serif;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#7A3E2E;font-weight:600;margin-bottom:6px}
h1.title{font-size:28px;font-weight:600;line-height:1.2;margin:0}
.byline{font-family:system-ui,sans-serif;font-size:11.5px;color:#6B6355;margin-top:9px}
.summary{display:flex;align-items:center;gap:24px;flex-wrap:wrap;background:#FDFCF8;border:1px solid #E4DCC9;border-radius:6px;padding:14px 20px;margin:24px 0 8px}
.s-cap{font-family:system-ui,sans-serif;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6B6355}
.s-counts{display:flex;align-items:center;gap:22px}
.s-count{display:flex;align-items:center;gap:8px;font-size:19px;font-weight:600}
.s-count .glyph{width:14px;display:inline-block}
.s-label{font-family:system-ui,sans-serif;font-size:11.5px;font-weight:500;color:#6B6355}
.s-total{font-family:system-ui,sans-serif;font-size:11.5px;color:#6B6355;margin-left:auto}
h2.sec{font-family:system-ui,sans-serif;font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#6B6355;font-weight:700;padding-bottom:8px;border-bottom:1px solid #E4DCC9;margin:32px 0 14px}
.stamp{display:inline-flex;align-items:center;gap:6px;border:1px solid;border-radius:2px;padding:3px 9px;font-family:system-ui,sans-serif;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.stamp .glyph{font-size:10px;line-height:1}
.claim{padding:16px 0;border-bottom:1px solid #E4DCC9}
.claim-top{display:flex;align-items:center;gap:12px}
.claim-title{font-size:16px;font-weight:600}
.claim-title .who{color:#7A3E2E}
.claim-top .stamp{margin-left:auto}
.receipt-ref{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:#6B6355;margin:8px 0 0}
.caveat{background:#F6EFDD;border:1px solid #DBCBA3;border-radius:5px;padding:10px 13px;margin-top:10px;max-width:62ch}
.caveat-label{display:block;font-family:system-ui,sans-serif;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8A6212;margin-bottom:4px}
.caveat-text{font-style:italic;font-size:13.5px;color:#4a4234}
.apx-note{font-family:system-ui,sans-serif;font-size:12px;color:#6B6355;margin:-4px 0 16px;max-width:64ch;line-height:1.55}
.apx-claim{border:1px solid #E4DCC9;border-radius:6px;margin-bottom:14px;overflow:hidden;background:#FDFCF8;break-inside:avoid}
.apx-head{display:flex;align-items:center;gap:12px;padding:10px 15px;background:#FCFBF7;border-bottom:1px solid #E4DCC9}
.apx-title{font-size:14px;font-weight:600}
.apx-title .ref{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#6B6355}
.apx-title .who{color:#7A3E2E}
.apx-head .stamp{margin-left:auto}
.receipts{margin:0}
.receipt{padding:11px 15px;border-bottom:1px solid #E4DCC9;break-inside:avoid}
.receipt:last-child{border-bottom:none}
.r-kind{font-family:system-ui,sans-serif;font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#6B6355;margin:0}
.r-value{font-size:13.5px;margin:3px 0 7px}
.r-link{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;word-break:break-all}
.r-img{max-width:100%;height:auto;border:1px solid #E4DCC9;border-radius:4px;display:block;margin-top:2px}
.r-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0}
.r-note{font-family:system-ui,sans-serif;font-size:10.5px;color:#6B6355;margin:5px 0 0}
.chip{display:inline-flex;align-items:center;gap:6px;border-radius:4px;padding:3px 9px;font-family:system-ui,sans-serif;font-size:10.5px;font-weight:500;white-space:nowrap}
.chip .pglyph{font-family:ui-monospace,Menlo,monospace;font-weight:700}
.liveness{display:inline-flex;align-items:center;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:.04em;border-radius:3px;padding:2px 8px;color:#2C6E49;background:#EBF1EC;border:1px solid #5F8E6C}
.ts{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:#6B6355}
.empty-state{font-family:system-ui,sans-serif;font-size:13px;color:#6B6355;padding:28px 0;line-height:1.6}
.trust{margin-top:34px;padding-top:16px;border-top:1px solid #E4DCC9;font-family:system-ui,sans-serif;font-size:11px;color:#6B6355;line-height:1.6}
.trust .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.trust .sep{color:#E4DCC9}
.trust b{color:#4a4234;font-weight:600}
.trust .line2{margin-top:5px}
@media print{
  html,body{background:#fff}
  body{padding:0}
  .page{box-shadow:none;border:none;border-radius:0;max-width:none;padding:24px 28px}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .claim,.apx-claim,.receipt{break-inside:avoid}
  h2.sec{break-after:avoid}
}
`;

/** Render the complete self-contained Client-Safe Report document (Story 4.3).
 *  Deterministic for a given model — no clock, no I/O, no external references. */
export function renderReportDocument(model: ReportDocumentModel): string {
  const lang = escapeHtml(model.htmlLang);
  const title = escapeHtml(model.title);

  const logo = model.agencyLogoDataUri
    ? `<img src="${escapeHtml(model.agencyLogoDataUri)}" alt="${escapeHtml(model.agencyName)}" />`
    : "";
  const byline = model.byline ? `<div class="byline">${escapeHtml(model.byline)}</div>` : "";
  // The demo SAMPLE honesty marker (AD-9): a prominent, print-surviving,
  // grayscale-legible banner. Bold uppercase + heavy border carry the meaning
  // with colour removed, so a printed/saved demo is unmistakably a sample.
  const sample = model.sampleBadge
    ? `<div class="sample" role="note">${escapeHtml(model.sampleBadge)}</div>`
    : "";

  // Body: either the claims + appendix, or the calm empty/withheld state (AC6).
  let body: string;
  if (model.emptyStateNote) {
    body = `<p class="empty-state">${escapeHtml(model.emptyStateNote)}</p>`;
  } else {
    const claims = model.claims.map((c) => claimHtml(c, model.caveatLabel)).join("");
    const appendix = model.appendix.map(appendixClaimHtml).join("");
    body =
      summaryHtml(model) +
      `<h2 class="sec">${escapeHtml(model.claimsHeading)}</h2>${claims}` +
      `<h2 class="sec">${escapeHtml(model.appendixHeading)}</h2>` +
      `<p class="apx-note">${markFrenchTerms(escapeHtml(model.appendixNote))}</p>${appendix}`;
  }

  const trust =
    `<footer class="trust"><div class="row">` +
    `<b>${escapeHtml(model.trustEuLabel)}</b><span class="sep">·</span>` +
    `${escapeHtml(model.trustLegal)}<span class="sep">·</span>` +
    `<b>${escapeHtml(model.trustExportLabel)}</b></div>` +
    `<div class="line2">${escapeHtml(model.trustAttribution)}</div></footer>`;

  return (
    `<!doctype html><html lang="${lang}"><head>` +
    `<meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<title>${title}</title>` +
    `<style>${STYLE}</style></head><body>` +
    `<main class="page">` +
    sample +
    `<div class="rpt-head">` +
    `<div class="lockup">${logo}<span class="agency">${escapeHtml(model.agencyName)}</span></div>` +
    `<div class="rpt-meta">` +
    `${escapeHtml(model.refLabel)} · <span class="val">${escapeHtml(model.reportRef)}</span><br />` +
    `${escapeHtml(model.issuedLabel)} · <span class="val">${escapeHtml(model.issuedDate)}</span>` +
    `</div></div>` +
    `<div class="title-block">` +
    `<div class="kicker">${escapeHtml(model.kicker)}</div>` +
    `<h1 class="title">${title}</h1>${byline}</div>` +
    body +
    trust +
    `</main></body></html>`
  );
}
