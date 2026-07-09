import "./shell.css";
import type { ReactNode } from "react";
import { type Locale, localeStrings } from "../_lib/i18n";
import { ClaimDrawer } from "./claim-drawer";
import { ClaimDrawerProvider } from "./claim-drawer-context";
import { LangToggle } from "./lang-toggle";
import { Rail } from "./rail";

// The oxblood seal-mark (UX-DR6 sanctioned use). A small wax-seal emblem in the
// wordmark — currentColor is set to --seal by the wordmark.
function SealMark() {
  return (
    <svg
      className="pd-sealmark"
      width="22"
      height="22"
      viewBox="0 0 22 22"
      role="img"
      aria-label="ProofDesk"
    >
      <circle cx="11" cy="11" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11" cy="11" r="5.5" fill="currentColor" opacity="0.14" />
      <path
        d="M7.4 11.2l2.6 2.5 4.6-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Desktop operator shell (UX-DR7): full-width top bar + persistent 214px rail +
// main canvas + right-side drawer slot. Depth is fill-shade + hairline only.
export function AppShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const strings = localeStrings(locale);

  return (
    <div className="pd-shell">
      <header className="pd-topbar">
        <a className="pd-wordmark" href="/">
          <SealMark />
          <span className="pd-wordmark__text">
            {strings.wordmark.a}
            <span className="pd-wordmark__dot">·</span>
            {strings.wordmark.b}
          </span>
        </a>

        {/* Campaign switcher — placeholder chrome; no real campaign wired (AD-9). */}
        <button type="button" className="pd-switcher">
          <span className="label-caps pd-switcher__cap">{strings.campaignLabel}</span>
          <span className="pd-switcher__name">{strings.campaignPlaceholder}</span>
          <span className="pd-switcher__chevron" aria-hidden="true">
            ▾
          </span>
        </button>

        <div className="pd-topbar__right">
          <LangToggle locale={locale} />
          {/* Operator identity — single shared credential (AD-14); no name wired. */}
          <div className="pd-operator">
            <span className="pd-operator__label">{strings.operatorLabel}</span>
            <span className="pd-operator__avatar" aria-hidden="true">
              ◆
            </span>
          </div>
        </div>
      </header>

      {/* The drawer context spans the rail, the board (page content) and the
          drawer so a Board row can open the Claim Card (Story 1.6). */}
      <ClaimDrawerProvider>
        <div className="pd-workspace">
          <Rail locale={locale} />
          <main className="pd-main">{children}</main>
          <ClaimDrawer locale={locale} />
          {/* Reserved standing-disclaimer slot (AD-3 / AD-22) — populated where
              verdicts appear, in later stories. Left empty by design here. */}
        </div>
      </ClaimDrawerProvider>
    </div>
  );
}
