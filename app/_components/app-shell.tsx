import "./shell.css";
import type { ReactNode } from "react";
import type { CampaignStageState } from "@/src/services";
import { resolveOperatorIdentity } from "@/src/services";
import { type Locale, localeStrings } from "../_lib/i18n";
import { ClaimDrawer } from "./claim-drawer";
import { ClaimDrawerProvider } from "./claim-drawer-context";
import { HowItWorks } from "./how-it-works";
import { LangToggle } from "./lang-toggle";
import { StageNext, StageStrip } from "./stage-strip";

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

// A small info mark for the standing disclaimer (UX-DR23). Inline SVG so it
// never depends on a glyph font subset (avoids the ● ◐ ▲ tofu risk) and stays
// decorative — the disclaimer text carries the meaning.
function InfoMark() {
  return (
    <svg
      className="pd-disclaimer__glyph"
      width="13"
      height="13"
      viewBox="0 0 16 16"
      role="presentation"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="4.6" r="0.95" fill="currentColor" />
      <path d="M8 7v5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// Desktop operator shell (UX-DR7): full-width top bar + horizontal workflow
// strip + main canvas + right-side drawer slot. Depth is fill-shade + hairline
// only (AI-10: the strip replaces the vertical rail).
export function AppShell({
  locale,
  children,
  stageState,
}: {
  locale: Locale;
  children: ReactNode;
  /** Honest per-stage strip state for the active campaign - server-resolved in
   *  the layout (Story AI-10). */
  stageState: CampaignStageState;
}) {
  const strings = localeStrings(locale);
  // The single operator's display agency, resolved server-side (AD-14) — the
  // "[agency]" half of the override attribution "by [operator] · [agency]"
  // (FR-10, UX-DR17). The "[operator]" half is the persisted `authored_by`.
  const { agency } = resolveOperatorIdentity();

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
          <HowItWorks locale={locale} />
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

      {/* The drawer context spans the board (page content) and the drawer so a
          Board row can open the Claim Card (Story 1.6). The strip sits outside
          this provider - it never opens the drawer. */}
      <StageStrip locale={locale} stageState={stageState} />
      <ClaimDrawerProvider>
        <div className="pd-workspace">
          <main className="pd-main">
            {children}
            <StageNext locale={locale} />
          </main>
          <ClaimDrawer locale={locale} agency={agency} />
        </div>
      </ClaimDrawerProvider>

      {/* Standing disclaimers (UX-DR23) — the shell wraps every operator surface
          where a verdict appears (Board, Cockpit, Claim Card drawer), so this one
          persistent footer satisfies "wherever verdicts appear" for all of them.
          The FR-16 automation disclaimer (AD-3) and the DISTINCT legal disclaimer
          (AD-22) both render — never one substituting for the other. */}
      <footer className="pd-disclaimer">
        <InfoMark />
        <div className="pd-disclaimer__lines">
          <p className="pd-disclaimer__line">{strings.automationDisclaimer}</p>
          <p className="pd-disclaimer__line">{strings.legalDisclaimer}</p>
        </div>
      </footer>
    </div>
  );
}
