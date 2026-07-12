"use client";

import "./client-safe-report.css";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { type Locale, localeStrings } from "../_lib/i18n";

// Story 4.3 — the Client-Safe Report builder page chrome. This is the OPERATOR's
// preview surface around the self-contained document, NOT the document itself:
// the document is assembled + rendered server-side (app/_lib/report-document.ts)
// and handed here as an opaque HTML string, shown faithfully inside an <iframe
// srcDoc> so it renders exactly as a client would see it — isolated from app
// chrome, "with no ProofDesk running" (AD-12).
//
// The interactive per-item include/exclude + byline builder lives behind the
// Story 4.1/4.2 PATCH routes; this page's job is to preview, print, and generate
// a new frozen version. The download filename + ZIP + demo hard-wall are Story 4.4.

interface ClientSafeReportProps {
  /** The rendered self-contained document, or null when no report exists yet. */
  html: string | null;
  locale: Locale;
  campaignId: string;
  /** `is_demo` — a demo's export is walled (AD-9, Story 4.4): the on-screen SAMPLE
   *  view is allowed, but Download is disabled and the document itself carries the
   *  SAMPLE marker. A real campaign enables Download. */
  isDemo: boolean;
}

export function ClientSafeReport({ html, locale, campaignId, isDemo }: ClientSafeReportProps) {
  const t = localeStrings(locale).report;
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(false);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(false);
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/report`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`generate failed: ${res.status}`);
      // A new frozen version now exists — re-render the server component to pick up
      // the freshly assembled document.
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setGenerating(false);
    }
  }, [campaignId, router]);

  const print = useCallback(() => {
    iframeRef.current?.contentWindow?.print();
  }, []);

  const documentUrl = `/api/campaigns/${encodeURIComponent(campaignId)}/report/document`;
  const downloadUrl = `/api/campaigns/${encodeURIComponent(campaignId)}/report/download`;

  return (
    <section className="csr">
      <div className="csr-bar">
        <span className="csr-label">{t.previewLabel}</span>
        {isDemo && (
          <span className="csr-sample" title={t.demoNotExportable}>
            {t.sampleBadge}
          </span>
        )}
        <div className="csr-actions">
          <button
            type="button"
            className="csr-btn csr-btn--primary"
            onClick={generate}
            disabled={generating}
          >
            {generating ? t.generating : t.generateAction}
          </button>
          {html !== null && (
            <>
              <button type="button" className="csr-btn" onClick={print}>
                {t.printAction}
              </button>
              <a className="csr-btn" href={documentUrl} target="_blank" rel="noreferrer">
                {t.openTab}
              </a>
              {/* Export hard-wall (AD-9): a demo shows a disabled Download; only a
                  real campaign links to the ZIP. The document itself also carries
                  the SAMPLE marker, so even a Print of the demo is unmistakable. */}
              {isDemo ? (
                <span className="csr-btn csr-btn--disabled" aria-disabled="true">
                  {t.downloadAction}
                </span>
              ) : (
                <a className="csr-btn" href={downloadUrl}>
                  {t.downloadAction}
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {isDemo && <p className="csr-demo-note">{t.demoNotExportable}</p>}

      {error && (
        <p className="csr-error" role="alert">
          {t.generateError}
        </p>
      )}

      {html !== null ? (
        <iframe className="csr-frame" title={t.previewLabel} srcDoc={html} ref={iframeRef} />
      ) : (
        <p className="csr-empty">{t.emptyNoReport}</p>
      )}
    </section>
  );
}
