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
  /** Campaign Board copy (Story 1.6). FR runs longer — stamps use nowrap so
   *  `Statut de preuve` / `Non défendable` never truncate (UX-DR26). */
  readonly board: {
    readonly indexHeader: string;
    readonly creatorHeader: string;
    readonly deliverableHeader: string;
    readonly claimedHeader: string;
    readonly statusHeader: string;
    readonly claimedMarker: string;
    readonly emptyState: string;
  };
  /** Run Proof Audit + Proof-Readiness summary copy (Story 1.7). Status labels
   *  here are TITLE-case (readiness/announcement voice); the UPPERCASE stamp
   *  labels stay in `design-tokens.ts`. Parameterized strings are functions so
   *  the numbers are never baked into the catalog (never hardcode 7·1·1). */
  readonly audit: {
    readonly runButton: string;
    readonly runningButton: string;
    /** Post-audit prefix; the mono `[HH:MM]` timestamp is appended by the UI. */
    readonly reRunPrefix: string;
    readonly runningLine: string;
    readonly readinessTitle: string;
    readonly readinessCaption: string;
    readonly readinessPending: string;
    readonly statusLabel: {
      readonly defensible: string;
      readonly caveated: string;
      readonly cantClaim: string;
    };
    readonly readingNote: (marked: number, total: number, green: number) => string;
    readonly announcement: (counts: AnnouncementCounts) => string;
  };
  /** Claim Card drawer copy (Story 1.8). Provenance/status glossary terms stay
   *  English in code; only rendered values localize. FR runs longer — drawer
   *  chips/labels use `white-space: nowrap` + size-to-content so nothing
   *  truncates at min desktop width (UX-DR26). Requirement-kind / evidence-type
   *  maps fall back to the raw key in the component when a kind is unknown. */
  readonly drawer: {
    readonly closeAria: string;
    readonly nextClaim: string;
    readonly loading: string;
    readonly loadError: string;
    readonly uploadedLabel: string;
    readonly machineVerdictLabel: string;
    readonly sections: {
      readonly requirements: string;
      readonly evidence: string;
      readonly facts: string;
      readonly caveat: string;
      readonly override: string;
    };
    readonly criticality: { readonly critical: string; readonly supporting: string };
    readonly provenance: { readonly machine: string; readonly human: string };
    readonly pendingNote: string;
    readonly caveatEmpty: string;
    readonly overrideEmpty: string;
    readonly unsatisfied: string;
    readonly satisfiedBy: (provenance: "machine" | "human") => string;
    readonly confirmedBy: (who: string, when: string) => string;
    /** Human override & caveat authoring (Story 1.9, FR-10, UX-DR16/DR17). The
     *  on/off word is ever-present (never colour/knob-position alone); the
     *  attribution lines render in mono. `overrideStatusLabel` names the three
     *  Proof Status options the override can set (TITLE-case reading voice, like
     *  `audit.statusLabel`). */
    readonly override: {
      readonly switchLabel: string;
      readonly on: string;
      readonly off: string;
      readonly setPrompt: string;
      readonly statusLabel: {
        readonly green: string;
        readonly yellow: string;
        readonly red: string;
      };
      readonly by: (operator: string, agency: string) => string;
    };
    readonly caveat: {
      readonly add: string;
      readonly placeholder: string;
      readonly save: string;
      readonly cancel: string;
      readonly by: (who: string) => string;
      readonly requiresNote: string;
    };
    readonly mutationError: string;
    readonly liveness: {
      readonly live: string;
      readonly dead: string;
      readonly blocked: string;
      readonly unresolved: string;
    };
    readonly requirementKind: Readonly<Record<string, string>>;
    readonly evidenceType: Readonly<Record<string, string>>;
  };
}

/** The numbers the aria-live audit-complete announcement is built from. */
export interface AnnouncementCounts {
  readonly green: number;
  readonly yellow: number;
  readonly red: number;
  readonly marked: number;
  readonly total: number;
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
  board: {
    indexHeader: "#",
    creatorHeader: "Creator",
    deliverableHeader: "Deliverable",
    claimedHeader: "Claimed",
    statusHeader: "Proof Status",
    claimedMarker: "Claimed",
    emptyState: "No campaign loaded.",
  },
  audit: {
    runButton: "Run Proof Audit",
    runningButton: "Running audit…",
    reRunPrefix: "Re-run Proof Audit · last run ",
    runningLine: "evaluating structured proof fields · link status",
    readinessTitle: "Proof-Readiness",
    readinessCaption: "Counts only — never a single score.",
    readinessPending: "Run the audit to see how many claims ProofDesk can back.",
    statusLabel: {
      defensible: "Defensible",
      caveated: "Caveated",
      cantClaim: "Can't claim",
    },
    readingNote: (marked, total, green) =>
      `You marked ${marked}/${total} done · ProofDesk can back ${green}.`,
    announcement: ({ green, yellow, red, marked, total }) =>
      `Audit complete. ${green} Defensible, ${yellow} Caveated, ${red} Can't claim. ` +
      `You marked ${marked} of ${total} done; ProofDesk can back ${green}.`,
  },
  drawer: {
    closeAria: "Close Claim Card",
    nextClaim: "Next claim",
    loading: "Loading claim…",
    loadError: "Couldn't load this claim. Close and try again.",
    uploadedLabel: "Uploaded",
    machineVerdictLabel: "Machine verdict",
    sections: {
      requirements: "Proof Requirements",
      evidence: "Evidence trail",
      facts: "Machine/Human facts",
      caveat: "Caveat",
      override: "Human override",
    },
    criticality: { critical: "Critical", supporting: "Supporting" },
    // Locked glossary terms (EXPERIENCE.md#Voice and Tone) — verbatim.
    provenance: { machine: "Machine-checked fact", human: "Human assertion" },
    pendingNote: "Run the audit to see this claim's proof status.",
    caveatEmpty: "No caveat recorded.",
    overrideEmpty: "No operator override. Machine verdict stands.",
    unsatisfied: "unsatisfied",
    satisfiedBy: (provenance) =>
      provenance === "machine"
        ? "satisfied by machine-checked fact"
        : "satisfied by human assertion",
    confirmedBy: (who, when) => `Confirmed by ${who} · ${when}`,
    override: {
      switchLabel: "Operator override",
      on: "On",
      off: "Off",
      setPrompt: "Set the effective Proof Status:",
      statusLabel: { green: "Defensible", yellow: "Caveated", red: "Can't claim" },
      by: (operator, agency) => `by ${operator} · ${agency}`,
    },
    caveat: {
      add: "Add caveat",
      placeholder: "State the missing evidence…",
      save: "Record caveat",
      cancel: "Cancel",
      by: (who) => `by ${who}`,
      requiresNote:
        "A Caveated claim needs at least one caveat before it can be included in a report.",
    },
    mutationError: "Couldn't save. Try again.",
    liveness: {
      live: "link resolves — content not verified",
      dead: "link doesn't resolve",
      blocked: "blocked — could not check (not gone)",
      unresolved: "couldn't be checked",
    },
    requirementKind: {
      "proof-of-posting": "Proof of posting",
      "disclosure-visible": "Disclosure visible",
      "reach-metric": "Reach metric",
      "segment-timestamp": "Segment timestamp",
    },
    evidenceType: {
      link: "Link",
      "creator-attestation": "Creator attestation",
      "disclosure-screenshot": "Disclosure screenshot",
      "metric-screenshot": "Metric screenshot",
    },
  },
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
  board: {
    indexHeader: "N°",
    creatorHeader: "Créateur",
    deliverableHeader: "Livrable",
    claimedHeader: "Revendiqué",
    // Locked FR glossary term (EXPERIENCE.md) — verbatim.
    statusHeader: "Statut de preuve",
    claimedMarker: "Revendiqué",
    emptyState: "Aucune campagne chargée.",
  },
  audit: {
    // Locked FR glossary terms (EXPERIENCE.md#Voice and Tone) — verbatim.
    runButton: "Lancer l’audit",
    runningButton: "Audit en cours…",
    reRunPrefix: "Relancer l’audit · dernier lancement ",
    runningLine: "évaluation des champs de preuve structurés · état des liens",
    readinessTitle: "Niveau de preuve",
    readinessCaption: "Uniquement des comptes — jamais un score unique.",
    readinessPending: "Lancez l’audit pour voir combien de revendications ProofDesk peut étayer.",
    statusLabel: {
      // Locked FR glossary status terms (EXPERIENCE.md#Proof Status) — verbatim.
      defensible: "Défendable",
      caveated: "Sous réserve",
      cantClaim: "Non défendable",
    },
    readingNote: (marked, total, green) =>
      `Vous avez marqué ${marked}/${total} comme faits · ProofDesk peut en étayer ${green}.`,
    announcement: ({ green, yellow, red, marked, total }) =>
      `Audit terminé. ${green} Défendable, ${yellow} Sous réserve, ${red} Non défendable. ` +
      `Vous avez marqué ${marked} sur ${total} comme faits ; ProofDesk peut en étayer ${green}.`,
  },
  drawer: {
    closeAria: "Fermer la fiche",
    nextClaim: "Revendication suivante",
    loading: "Chargement de la revendication…",
    loadError: "Impossible de charger cette revendication. Fermez et réessayez.",
    uploadedLabel: "Téléversé",
    machineVerdictLabel: "Verdict machine",
    sections: {
      requirements: "Exigences de preuve",
      evidence: "Trace des preuves",
      facts: "Faits machine/humain",
      caveat: "Réserve",
      // Locked FR glossary term (EXPERIENCE.md) — verbatim.
      override: "Arbitrage humain",
    },
    criticality: { critical: "Essentiel", supporting: "Complémentaire" },
    // Locked FR glossary terms (EXPERIENCE.md#Voice and Tone) — verbatim.
    provenance: { machine: "Fait vérifié par la machine", human: "Déclaration humaine" },
    pendingNote: "Lancez l’audit pour voir le statut de preuve.",
    caveatEmpty: "Aucune réserve enregistrée.",
    overrideEmpty: "Aucun arbitrage de l’opérateur. Le verdict machine s’applique.",
    unsatisfied: "non satisfait",
    satisfiedBy: (provenance) =>
      provenance === "machine"
        ? "satisfait par un fait vérifié par la machine"
        : "satisfait par une déclaration humaine",
    confirmedBy: (who, when) => `Confirmé par ${who} · ${when}`,
    override: {
      // Locked FR glossary term (EXPERIENCE.md#L77): Human override → Arbitrage humain.
      switchLabel: "Arbitrage humain",
      on: "Activé",
      off: "Désactivé",
      setPrompt: "Définir le statut de preuve effectif :",
      // Locked FR glossary status terms (EXPERIENCE.md#Proof Status) — verbatim.
      statusLabel: { green: "Défendable", yellow: "Sous réserve", red: "Non défendable" },
      by: (operator, agency) => `par ${operator} · ${agency}`,
    },
    caveat: {
      add: "Ajouter une réserve",
      placeholder: "Indiquez la preuve manquante…",
      save: "Enregistrer la réserve",
      cancel: "Annuler",
      by: (who) => `par ${who}`,
      requiresNote:
        "Une revendication sous réserve nécessite au moins une réserve avant de pouvoir figurer dans un rapport.",
    },
    mutationError: "Échec de l’enregistrement. Réessayez.",
    liveness: {
      live: "le lien répond — contenu non vérifié",
      dead: "le lien ne répond pas",
      blocked: "bloqué — vérification impossible (pas disparu)",
      unresolved: "n’a pas pu être vérifié",
    },
    requirementKind: {
      "proof-of-posting": "Preuve de publication",
      "disclosure-visible": "Divulgation visible",
      "reach-metric": "Métrique d’audience",
      "segment-timestamp": "Horodatage du segment",
    },
    evidenceType: {
      link: "Lien",
      "creator-attestation": "Attestation du créateur",
      "disclosure-screenshot": "Capture de divulgation",
      "metric-screenshot": "Capture de métrique",
    },
  },
};

const CATALOG: Record<Locale, Strings> = { en: EN, fr: FR };

export function localeStrings(locale: Locale): Strings {
  return CATALOG[locale];
}
