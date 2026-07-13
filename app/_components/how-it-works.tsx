"use client";

import { useEffect, useState } from "react";
import { type Locale, localeStrings } from "../_lib/i18n";

const SEEN_KEY = "proofdesk_explainer_seen";

// First-run "How ProofDesk works" explainer (AI-10 renders AI-9's copy). Opens
// once automatically on first load (a per-browser localStorage flag), is
// dismissible, and stays re-openable from the persistent trigger. It points the
// operator at the strip - the strip is the permanent 4-step map, this just names
// it the first time. Not gated, no blocking.
export function HowItWorks({ locale }: { locale: Locale }) {
  const s = localeStrings(locale).explainer;
  const [open, setOpen] = useState(false);

  // First-run auto-open runs client-side only (SSR renders the trigger closed,
  // avoiding a hydration mismatch on the localStorage read).
  useEffect(() => {
    if (localStorage.getItem(SEEN_KEY) === null) setOpen(true);
  }, []);

  function dismiss() {
    localStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
  }

  return (
    <>
      <button type="button" className="pd-howto__trigger" onClick={() => setOpen(true)}>
        {s.reopen}
      </button>
      {open ? (
        <div className="pd-howto__scrim" role="dialog" aria-modal="true" aria-label={s.reopen}>
          <div className="pd-howto__panel">
            <p className="pd-howto__intro">{s.intro}</p>
            <ol className="pd-howto__steps">
              {s.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <button type="button" className="pd-howto__dismiss" onClick={dismiss}>
              {s.dismiss}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
