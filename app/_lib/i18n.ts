// i18n foundation (UX-DR26 base; ARCHITECTURE-SPINE.md#L170).
//
// EN + FR are both first-class. User-facing copy is externalised here; glossary
// terms stay English *in code* (keys, types) — only rendered strings localise.
// The toggle sets <html lang> and persists via a cookie the root layout reads
// server-side (flash-free SSR). The spine mandates the outcome (persists across
// surfaces), not the mechanism — cookie is the chosen implementation.

export type Locale = "en" | "fr";

export const LOCALES = ["en", "fr"] as const;
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "proofdesk_locale";
/** 1 year, in seconds — the choice persists across sessions and surfaces. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "fr";
}

/** Parse a cookie/header value into a Locale, falling back to the default. */
export function parseLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** The four operator surfaces, in the fixed spine order (UX-DR7). */
export const RAIL_SURFACES = [
  { key: "audit-cockpit", href: "/", frProvisional: true },
  { key: "proof-brief", href: "/proof-brief", frProvisional: false },
  { key: "evidence-inbox", href: "/evidence-inbox", frProvisional: false, badge: true },
  { key: "client-safe-report", href: "/client-safe-report", frProvisional: false },
] as const;

export type RailSurfaceKey = (typeof RAIL_SURFACES)[number]["key"];

interface Strings {
  readonly langName: string;
  readonly wordmark: { readonly a: string; readonly b: string };
  readonly campaignLabel: string;
  readonly campaignPlaceholder: string;
  readonly operatorLabel: string;
  readonly railCap: string;
  readonly rail: Record<RailSurfaceKey, string>;
  readonly cockpitLead: string;
  readonly surfaceComingSoon: string;
  readonly railBadgeEmpty: string;
  readonly langToggleAria: string;
  /** Reserved standing-disclaimer slot copy — rendered where verdicts appear
   * (AD-3 / AD-22). Present as a token so later stories wire it, not the shell. */
  readonly automationDisclaimer: string;
  readonly legalDisclaimer: string;
}

const EN: Strings = {
  langName: "English",
  wordmark: { a: "Proof", b: "Desk" },
  campaignLabel: "Campaign",
  campaignPlaceholder: "No campaign selected",
  operatorLabel: "Operator",
  railCap: "Campaign",
  rail: {
    "audit-cockpit": "Audit Cockpit",
    "proof-brief": "Proof Brief",
    "evidence-inbox": "Evidence Inbox",
    "client-safe-report": "Client-Safe Report",
  },
  cockpitLead: "The claimed-vs-proven ledger arrives in a later story.",
  surfaceComingSoon:
    "This surface is part of the persistent shell. Its content arrives in a later story.",
  railBadgeEmpty: "No campaign loaded",
  langToggleAria: "Switch language",
  automationDisclaimer:
    "ProofDesk verifies structured proof fields and link status. It does not automatically watch streams or validate viewer metrics.",
  legalDisclaimer:
    "Evidence management and reporting support — not legal advice or a guarantee of compliance.",
};

const FR: Strings = {
  langName: "Français",
  wordmark: { a: "Proof", b: "Desk" },
  campaignLabel: "Campagne",
  campaignPlaceholder: "Aucune campagne sélectionnée",
  operatorLabel: "Opérateur",
  railCap: "Campagne",
  rail: {
    // PROVISIONAL — "Audit Cockpit" has no locked FR term in the EXPERIENCE
    // glossary (see story Questions §1). Do not treat as final.
    "audit-cockpit": "Cockpit d’audit",
    // Locked FR glossary terms (EXPERIENCE.md#L77) — verbatim.
    "proof-brief": "Cahier des preuves",
    "evidence-inbox": "Boîte à preuves",
    "client-safe-report": "Rapport prêt-client",
  },
  cockpitLead: "Le registre revendiqué-vs-prouvé arrivera dans une prochaine étape.",
  surfaceComingSoon:
    "Cette surface fait partie de l’interface persistante. Son contenu arrivera dans une prochaine étape.",
  railBadgeEmpty: "Aucune campagne chargée",
  langToggleAria: "Changer de langue",
  automationDisclaimer:
    "ProofDesk vérifie les champs de preuve structurés et l’état des liens. Il ne visionne pas automatiquement les diffusions et ne valide pas les métriques d’audience.",
  legalDisclaimer:
    "Support de gestion des preuves et de reporting — ni conseil juridique, ni garantie de conformité.",
};

const CATALOG: Record<Locale, Strings> = { en: EN, fr: FR };

export function localeStrings(locale: Locale): Strings {
  return CATALOG[locale];
}
