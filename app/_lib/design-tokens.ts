// Design tokens — canonical values (UX-DR1–UX-DR6).
//
// This module is the single source of truth for the palette hexes and the
// status/provenance *vocabulary* (shape glyph + EN/FR stamp label) that JS/TSX
// needs to render. The runtime styling source is `app/globals.css`, which
// declares the same hexes as CSS custom properties; a Vitest drift guard
// (tests/design-tokens.test.ts) asserts the two never diverge.
//
// Values are authoritative from DESIGN.md#L18-46 (the spine governs over the
// mock; the mock's lighter status borders are intentionally NOT used).

/** Every canonical colour token, keyed by its CSS custom-property name. */
export const PALETTE = {
  // UX-DR1 — warm-cream base
  canvas: "#F5EFE1",
  "surface-card": "#FCFBF7",
  "surface-raised": "#FDFCF8",
  ink: "#1E1B14",
  muted: "#6B6355",
  hairline: "#E4DCC9",
  seal: "#7A3E2E",
  // UX-DR6 — focus ring is its own token (same hue as seal, the one sanctioned
  // non-mark use of oxblood).
  "focus-ring": "#7A3E2E",
  // UX-DR2 — Proof Status: ink / fill / border (DESIGN borders, ~3:1 crisp)
  "status-green": "#2C6E49",
  "status-green-fill": "#EBF1EC",
  "status-green-border": "#5F8E6C",
  "status-amber": "#8A6212",
  "status-amber-fill": "#F2EBD6",
  "status-amber-border": "#9C844A",
  "status-red": "#9C2B27",
  "status-red-fill": "#F1E1DF",
  "status-red-border": "#A76F6A",
  // UX-DR3 — provenance (cool slate vs warm taupe), kept OFF the R/Y/G scale
  "machine-ink": "#3C5A66",
  "machine-bg": "#E7EDEF",
  "human-ink": "#6B5B47",
  "human-bg": "#EFE7D6",
  // Reserved — consumed by later stories (defined now so the vocabulary is whole)
  "caveat-fill": "#F6EFDD",
  "caveat-border": "#DBCBA3",
} as const;

export type PaletteToken = keyof typeof PALETTE;

// The NON-colour tokens (UX-DR4/UX-DR5/UX-DR7). Like PALETTE, these are the
// canonical single source of truth mirrored into `app/globals.css`; the drift
// guard (tests/design-tokens.test.ts) asserts globals.css never diverges from
// these AND that globals.css declares no orphan `--token` missing from here.
// Values are byte-identical to the globals.css declarations (whitespace-
// normalised in the test).

/** UX-DR5 — 4px spacing scale, keyed by CSS custom-property name. */
export const SPACING = {
  "space-1": "4px",
  "space-2": "8px",
  "space-3": "12px",
  "space-4": "16px",
  "space-5": "20px",
  "space-6": "24px",
  "space-8": "32px",
  "space-10": "40px",
} as const;

/** UX-DR5 — document-register radius scale. */
export const RADIUS = {
  "radius-stamp": "2px",
  "radius-sm": "3px",
  "radius-md": "6px",
  "radius-lg": "7px",
} as const;

/** UX-DR5/UX-DR7 — fixed shell dimensions. */
export const SHELL_DIMS = {
  "rail-width": "214px",
  "drawer-width": "498px",
  "report-measure": "62ch",
} as const;

/** UX-DR4 — semantic type scale (font shorthand). */
export const TYPE_SCALE = {
  "type-report-title": "600 29px / 1.2 var(--font-record)",
  "type-page-title": "600 23px / 1.25 var(--font-record)",
  "type-drawer-title": "600 19px / 1.3 var(--font-record)",
  "type-claim-title": "600 17px / 1.35 var(--font-record)",
  "type-serif-body": "400 14px / 1.55 var(--font-record)",
  "type-body": "400 13px / 1.45 var(--font-chrome)",
  "type-body-sm": "400 11.5px / 1.5 var(--font-chrome)",
  "type-stamp": "700 10.5px / 1 var(--font-chrome)",
  "type-mono": "400 11px / 1.4 var(--font-ledger)",
  "type-mono-value": "400 14px / 1.4 var(--font-ledger)",
} as const;

/** The type-voice family vars are injected on <html> by next/font (app/fonts.ts),
 *  not declared in globals.css `:root` — documented exceptions the orphan-var
 *  guard must allow if they ever appear. */
export const FONT_FAMILY_VARS = ["font-record", "font-chrome", "font-ledger"] as const;

/** Proof Status keys in the fixed green → amber → red order. */
export const STATUS_ORDER = ["defensible", "caveated", "cant-claim"] as const;
export type ProofStatusKey = (typeof STATUS_ORDER)[number];

export interface ProofStatusToken {
  readonly key: ProofStatusKey;
  /** Shape glyph — the colour-independent channel (AD-12). */
  readonly glyph: string;
  readonly labelEn: string;
  readonly labelFr: string;
  readonly ink: string;
  readonly fill: string;
  readonly border: string;
}

// FR stamp labels are the uppercase forms of the locked glossary terms
// (Défendable / Sous réserve / Non défendable — EXPERIENCE.md#L77).
export const PROOF_STATUS_TOKENS: Record<ProofStatusKey, ProofStatusToken> = {
  defensible: {
    key: "defensible",
    glyph: "●",
    labelEn: "DEFENSIBLE",
    labelFr: "DÉFENDABLE",
    ink: PALETTE["status-green"],
    fill: PALETTE["status-green-fill"],
    border: PALETTE["status-green-border"],
  },
  caveated: {
    key: "caveated",
    glyph: "◐",
    labelEn: "CAVEATED",
    labelFr: "SOUS RÉSERVE",
    ink: PALETTE["status-amber"],
    fill: PALETTE["status-amber-fill"],
    border: PALETTE["status-amber-border"],
  },
  "cant-claim": {
    key: "cant-claim",
    glyph: "▲",
    labelEn: "CAN'T CLAIM",
    labelFr: "NON DÉFENDABLE",
    ink: PALETTE["status-red"],
    fill: PALETTE["status-red-fill"],
    border: PALETTE["status-red-border"],
  },
};

// The pre-audit UI state (Story 1.6). NOT a Proof Status — it never enters the
// domain enum or STATUS_ORDER. Rendered as a muted stamp (hollow glyph + label,
// never colour-alone, AD-12) kept OFF the R/Y/G scale.
export const PENDING_TOKEN = {
  glyph: "◯",
  labelEn: "PENDING",
  labelFr: "EN ATTENTE",
} as const;

export interface ProvenanceToken {
  readonly glyph: string;
  readonly ink: string;
  readonly bg: string;
}

// Provenance is a cool-vs-warm axis kept deliberately OFF the R/Y/G status
// scale — two orthogonal visual systems that never collide (AD-3 invariant).
export const PROVENANCE_TOKENS = {
  machine: { glyph: "✓", ink: PALETTE["machine-ink"], bg: PALETTE["machine-bg"] },
  human: { glyph: "❝", ink: PALETTE["human-ink"], bg: PALETTE["human-bg"] },
} as const satisfies Record<string, ProvenanceToken>;
