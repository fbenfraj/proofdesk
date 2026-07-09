// Three type voices (UX-DR4), embedded & OS-independent via next/font.
//
// next/font/google self-hosts the font files into the build output and inlines
// the @font-face CSS — zero external runtime request, identical bytes in both
// run modes (AD-15). Each voice is exposed as a CSS custom property consumed by
// globals.css: --font-record / --font-chrome / --font-ledger. `latin-ext` is
// included so French copy (Défendable, prêt-client…) never renders tofu.

import { IBM_Plex_Mono, Inter, Source_Serif_4 } from "next/font/google";

// RECORD voice — headings, titles, report body. Embedded so the record reads
// the same everywhere; Georgia/Times are the fallback only (DESIGN.md#L255).
export const fontRecord = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-record",
  fallback: ["Source Serif Pro", "Georgia", "Times New Roman", "serif"],
});

// CHROME voice — nav, controls, table cells, microcopy.
export const fontChrome = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-chrome",
  fallback: ["system-ui", "-apple-system", "sans-serif"],
});

// LEDGER voice — timestamps, IDs, liveness, receipt values, counts.
export const fontLedger = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-ledger",
  fallback: ["ui-monospace", "SF Mono", "Menlo", "monospace"],
});

export const fontVariables = `${fontRecord.variable} ${fontChrome.variable} ${fontLedger.variable}`;
