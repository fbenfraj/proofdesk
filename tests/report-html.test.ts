// Story 4.3 — the PURE self-contained document renderer (FR-14, AD-12/AD-22).
// The renderer is a pure function of a fully-resolved model, so these tests feed
// it plain data (no DB) and assert the honesty-load-bearing render invariants:
//   AC1 — self-contained: <!doctype>, inline <style>, no external asset refs,
//         screenshots as data: URIs; deterministic; XSS-escaped user data.
//   AC2 — every status stamp is 3-channel (glyph + label + colour), grayscale-safe.
//   AC3 — trust footer carries the verbatim legal disclaimer; only honest counts.
//   AC4 — real semantics (one <h1>, <h2> Claims/Appendix, <dl> receipts), live
//         text (claim/receipt values are text nodes, never <img>), img has alt.
//   AC5 — FR labels render; "collaboration commerciale" is wrapped lang="fr".
//   AC6 — the empty/withheld state renders a calm note with no claims/appendix.

import { describe, expect, test } from "vitest";
import {
  type ReportDocumentModel,
  type ReportDocumentReceipt,
  renderReportDocument,
} from "@/src/export";

const GREEN = {
  glyph: "●",
  label: "DEFENSIBLE",
  ink: "#2c6e49",
  fill: "#ebf1ec",
  border: "#5f8e6c",
};
const AMBER = { glyph: "◐", label: "CAVEATED", ink: "#8a6212", fill: "#f2ebd6", border: "#9c844a" };
const MACHINE = { glyph: "✓", label: "Machine-checked fact", ink: "#3c5a66", bg: "#e7edef" };
const HUMAN = { glyph: "❝", label: "Human assertion", ink: "#6b5b47", bg: "#efe7d6" };

const PNG_DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA";

function linkReceipt(): ReportDocumentReceipt {
  return {
    kindLabel: "VOD link",
    provenance: MACHINE,
    value: { kind: "link", url: "https://twitch.tv/videos/2141906?t=1h12m40s" },
    livenessStamp: "LIVENESS: LIVE",
    livenessNote: "link resolves — content not verified",
    timestamp: "2026-07-09T09:04:00.000Z",
  };
}

function imageReceipt(): ReportDocumentReceipt {
  return {
    kindLabel: "Disclosure screenshot",
    provenance: MACHINE,
    value: { kind: "image", dataUri: PNG_DATA_URI, alt: "disclosure overlay" },
    livenessStamp: null,
    livenessNote: null,
    timestamp: "2026-07-09T09:05:00.000Z",
  };
}

function metricReceipt(): ReportDocumentReceipt {
  return {
    kindLabel: "Peak viewer figure",
    provenance: HUMAN,
    value: { kind: "text", text: "5,380 peak concurrent" },
    livenessStamp: null,
    livenessNote: null,
    timestamp: "2026-07-08T20:11:00.000Z",
  };
}

function baseModel(overrides: Partial<ReportDocumentModel> = {}): ReportDocumentModel {
  return {
    htmlLang: "en",
    title: "Lumen × Twitch Creator Sprint, Q3",
    kicker: "Proof of Performance",
    sampleBadge: null,
    agencyName: "Studio Kairos",
    agencyLogoDataUri: null,
    byline: "Prepared by Studio Kairos · Proof audit by ProofDesk",
    reportRef: "lumen-twitch-sprint-v1",
    refLabel: "Report ref",
    issuedDate: "2026-07-09T00:00:00.000Z",
    issuedLabel: "Issued",
    summaryCaption: "Summary",
    summaryCounts: [
      { glyph: "●", label: "DEFENSIBLE", ink: "#2c6e49", count: 1 },
      { glyph: "◐", label: "CAVEATED", ink: "#8a6212", count: 1 },
    ],
    summaryTotal: "2 claims · each backed by receipts",
    claimsHeading: "Claims",
    appendixHeading: "Proof Appendix",
    appendixNote: "Each receipt is labelled machine-checked fact or human assertion.",
    caveatLabel: "Caveat",
    claims: [
      {
        ref: "A1",
        creatorName: "Malo",
        deliverableType: "Twitch sponsor segment",
        status: GREEN,
        caveats: [],
        receiptRefLabel: "Receipts in Proof Appendix — A1",
      },
      {
        ref: "A2",
        creatorName: "Rayan",
        deliverableType: "Twitch sponsor segment",
        status: AMBER,
        caveats: ["Rests on the creator's word — needs a timestamped clip."],
        receiptRefLabel: "Receipts in Proof Appendix — A2",
      },
    ],
    appendix: [
      {
        ref: "A1",
        creatorName: "Malo",
        deliverableType: "Twitch sponsor segment",
        status: GREEN,
        receipts: [linkReceipt(), imageReceipt(), metricReceipt()],
      },
      {
        ref: "A2",
        creatorName: "Rayan",
        deliverableType: "Twitch sponsor segment",
        status: AMBER,
        receipts: [metricReceipt()],
      },
    ],
    emptyStateNote: null,
    trustEuLabel: "EU-hosted · RGPD-compliant",
    trustLegal:
      "Evidence management and reporting support — not legal advice or a guarantee of compliance.",
    trustExportLabel: "Full export · no lock-in",
    trustAttribution: "Studio Kairos · Proof audit by ProofDesk · lumen-twitch-sprint-v1",
    ...overrides,
  };
}

/** Every `src="…"` attribute must be a data: URI — no external asset fetch. */
function assetSrcs(html: string): string[] {
  return [...html.matchAll(/src="([^"]*)"/g)].map((m) => m[1]);
}

describe("AC1 — the document is self-contained and offline", () => {
  test("it is a complete HTML document with an inline style block", () => {
    const html = renderReportDocument(baseModel());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>");
    expect(html).toContain("</html>");
  });

  test("no external asset references — no <script>, <link>, @import; every img src is a data: URI", () => {
    const html = renderReportDocument(baseModel());
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<link ");
    expect(html).not.toContain("@import");
    const srcs = assetSrcs(html);
    expect(srcs.length).toBeGreaterThan(0); // the screenshot is inlined
    for (const src of srcs) expect(src.startsWith("data:")).toBe(true);
  });

  test("it is deterministic — the same model renders byte-identically", () => {
    expect(renderReportDocument(baseModel())).toBe(renderReportDocument(baseModel()));
  });

  test("user data is HTML-escaped — a script-bearing caveat cannot execute", () => {
    const html = renderReportDocument(
      baseModel({
        claims: [
          {
            ref: "A1",
            creatorName: 'Malo <img src=x onerror="alert(1)">',
            deliverableType: "Twitch",
            status: AMBER,
            caveats: ["<script>alert('xss')</script> & <b>bold</b>"],
            receiptRefLabel: "Receipts — A1",
          },
        ],
      }),
    );
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });
});

describe("AC2 — every status stamp is 3-channel and grayscale-safe", () => {
  test("a Green and an Amber stamp each carry glyph + uppercase label + colour", () => {
    const html = renderReportDocument(baseModel());
    // glyph + label together
    expect(html).toContain("●");
    expect(html).toContain("DEFENSIBLE");
    expect(html).toContain("◐");
    expect(html).toContain("CAVEATED");
    // colour is present but not the sole channel (label + glyph survive grayscale)
    expect(html).toContain("#2c6e49");
    expect(html).toContain("#8a6212");
  });

  test("the stamp exposes an aria-label so it reads as one unit", () => {
    const html = renderReportDocument(baseModel());
    expect(html).toContain('aria-label="DEFENSIBLE"');
  });
});

describe("AC3 — trust footer verbatim; only honest counts", () => {
  test("the legal disclaimer is present verbatim", () => {
    const html = renderReportDocument(baseModel());
    expect(html).toContain(
      "Evidence management and reporting support — not legal advice or a guarantee of compliance.",
    );
    expect(html).toContain("EU-hosted · RGPD-compliant");
    expect(html).toContain("Full export · no lock-in");
  });

  test("summary shows the exact counts it was given — no invented figure", () => {
    const html = renderReportDocument(
      baseModel({
        summaryCounts: [{ glyph: "●", label: "DEFENSIBLE", ink: "#2c6e49", count: 2 }],
        summaryTotal: "2 claims · each backed by receipts",
      }),
    );
    // the only digits are the real count(s), the total, and receipt timestamps.
    expect(html).toContain(">2<");
    // No fabricated percentage in the rendered CONTENT (the inline CSS legitimately
    // uses `max-width:100%`, so check the body with the <style> block stripped).
    const body = html.replace(/<style>[\s\S]*?<\/style>/, "");
    expect(body).not.toContain("%");
  });
});

describe("AC4 — real accessible semantics; live text, never rasterized", () => {
  test("exactly one <h1>, and <h2> for Claims and Proof Appendix", () => {
    const html = renderReportDocument(baseModel());
    expect([...html.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    expect(html).toContain("<h2");
    expect(html).toContain("Claims");
    expect(html).toContain("Proof Appendix");
  });

  test("receipts are a definition list and claim/receipt text is not inside <img>", () => {
    const html = renderReportDocument(baseModel());
    expect(html).toContain("<dl");
    expect(html).toContain("<dt");
    // The link URL and metric value render as live text, not as an image.
    expect(html).toContain("twitch.tv/videos/2141906");
    expect(html).toContain("5,380 peak concurrent");
  });

  test("the one screenshot <img> carries a non-empty alt", () => {
    const html = renderReportDocument(baseModel());
    expect(html).toContain('alt="disclosure overlay"');
  });
});

describe("AC5 — FR locale renders locked terms and wraps collaboration commerciale", () => {
  test("FR status labels render and collaboration commerciale is lang-tagged", () => {
    const html = renderReportDocument(
      baseModel({
        htmlLang: "fr",
        claims: [
          {
            ref: "A1",
            creatorName: "Malo",
            deliverableType: "Segment sponsorisé Twitch",
            status: { ...GREEN, label: "DÉFENDABLE" },
            caveats: ["La mention collaboration commerciale est visible."],
            receiptRefLabel: "Preuves en annexe — A1",
          },
        ],
      }),
    );
    expect(html).toContain('lang="fr"');
    expect(html).toContain("DÉFENDABLE");
    expect(html).toContain('<span lang="fr">collaboration commerciale</span>');
  });

  test("the caveat label is the injected localized string, not a hardcoded English word", () => {
    const html = renderReportDocument(
      baseModel({
        caveatLabel: "Réserve",
        claims: [
          {
            ref: "A1",
            creatorName: "Rayan",
            deliverableType: "Segment sponsorisé Twitch",
            status: AMBER,
            caveats: ["Repose sur la parole du créateur."],
            receiptRefLabel: "Preuves en annexe — A1",
          },
        ],
      }),
    );
    expect(html).toContain('<span class="caveat-label">Réserve</span>');
    expect(html).not.toContain('<span class="caveat-label">Caveat</span>');
  });
});

describe("AC6 — the withheld/empty state renders a calm note, no claims", () => {
  test("emptyStateNote replaces the claims + appendix body", () => {
    const html = renderReportDocument(
      baseModel({
        emptyStateNote: "The evidence changed after this report was frozen — regenerate it.",
        claims: [],
        appendix: [],
      }),
    );
    expect(html).toContain("The evidence changed after this report was frozen");
    expect(html).not.toContain("Receipts in Proof Appendix");
    // the trust footer still renders on an empty report
    expect(html).toContain("not legal advice");
  });
});
