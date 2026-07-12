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
  /** Rail count badge title when N unassigned items exist (UX rail-badge). */
  readonly railBadgeCount: (n: number) => string;
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
    /** "Confirm page shows the Deliverable" control (Story 2.3, AD-18). The
     *  action label asserts a HUMAN attestation — it must never imply machine
     *  verification of the page's content (AD-3). `ariaLabel` names the
     *  Deliverable so the control is unambiguous to screen readers. Sizes to
     *  content (no fixed widths); FR runs longer (UX-DR26). */
    readonly confirm: {
      readonly action: string;
      readonly ariaLabel: (deliverable: string) => string;
    };
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
      /** Verbatim inline prompt shown on a dead/unresolved link (Story 2.4,
       *  UX-DR11/UX-DR29). The EN value is fixed by the spec — do not reword. */
      readonly deadPrompt: string;
    };
    readonly requirementKind: Readonly<Record<string, string>>;
    readonly evidenceType: Readonly<Record<string, string>>;
  };
  /** Evidence Inbox ingest copy (Story 2.1, FR-5, UX Evidence-Inbox intake).
   *  Sober/audit register (UX-DR29) — no hype, no "smart"/confidence language.
   *  `intakeKind` labels name the four intake choices; the operator-editable
   *  `type` label is a separate free-text field. FR "Boîte à preuves" is the
   *  locked glossary term; controls size-to-content (no fixed widths, UX-DR26). */
  readonly inbox: {
    readonly title: string;
    readonly lead: string;
    readonly addHeading: string;
    readonly intakeKind: {
      readonly url: string;
      readonly image: string;
      readonly text: string;
      readonly metric: string;
    };
    readonly urlLabel: string;
    readonly urlPlaceholder: string;
    readonly noteLabel: string;
    readonly notePlaceholder: string;
    readonly fileLabel: string;
    readonly typeLabel: string;
    readonly typePlaceholder: string;
    readonly clientCapturedLabel: string;
    readonly submit: string;
    readonly submitting: string;
    readonly error: string;
    readonly empty: string;
    readonly listHeading: string;
    /** Card footer: the mono server timestamp, prefixed. */
    readonly capturedClientLabel: string;
    /** Deterministic Evidence→Deliverable matching (Story 2.2, FR-6, UX-DR19).
     *  Sober register — NO confidence/ranking/"most likely" copy anywhere. The
     *  suggestion is a machine act; the confirmed match is operator-affirmed. */
    readonly match: {
      readonly helper: string;
      readonly suggestedHeading: string;
      readonly byRule: string;
      readonly noMatchHeading: string;
      readonly unassigned: string;
      readonly unassignedReason: string;
      readonly assignedHeading: string;
      readonly confirm: string;
      readonly reassign: string;
      readonly assign: string;
      readonly choose: string;
      readonly undo: string;
      readonly seeded: string;
      readonly toastConfirmed: string;
      readonly toastReassigned: string;
      readonly deliverable: (creator: string, type: string) => string;
    };
  };
  /** Mobile capture-only surface (Story 2.5, UX-DR8, FR-5). A stripped three-
   *  action intake — paste link / upload screenshot / paste note — that feeds the
   *  SAME ingest pipeline as the desktop Inbox (no mobile-only path). Sober/audit
   *  register (UX-DR29); the three action labels echo the locked `inbox.intakeKind`
   *  wording. Glossary terms stay English in code; only rendered copy localises. */
  readonly capture: {
    readonly title: string;
    readonly lead: string;
    readonly action: {
      readonly url: string;
      readonly image: string;
      readonly text: string;
    };
    readonly urlLabel: string;
    readonly urlPlaceholder: string;
    readonly noteLabel: string;
    readonly notePlaceholder: string;
    readonly fileLabel: string;
    readonly typeLabel: string;
    readonly typePlaceholder: string;
    readonly submit: string;
    readonly submitting: string;
    readonly success: string;
    readonly error: string;
  };
  /** Proof Brief — template picker + per-Deliverable requirement authoring
   *  (Story 3.2, FR-3, UX-DR21). Criticality labels reuse `drawer.criticality`.
   *  The `provisional` copy carries the GATE b/3 honesty (default sets are not
   *  yet confirmed against real platform rules — never authoritative). */
  readonly proofBrief: {
    readonly title: string;
    readonly lead: string;
    readonly unsetHeading: string;
    readonly unsetBody: string;
    readonly pickTemplate: string;
    readonly applyTemplate: string;
    readonly templatePreviewHeading: string;
    readonly provisionalBadge: string;
    readonly provisionalNote: string;
    readonly requirementsHeading: string;
    readonly addRequirement: string;
    readonly kindLabel: string;
    readonly kindPlaceholder: string;
    readonly labelLabel: string;
    readonly labelPlaceholder: string;
    readonly criticalityLabel: string;
    readonly save: string;
    readonly cancel: string;
    readonly edit: string;
    readonly remove: string;
    readonly error: string;
    /** Shown when removal is blocked because evidence is linked (AC6). */
    readonly removeBlocked: string;
    readonly satisfiedByLabel: string;
    readonly satisfaction: {
      readonly "link-reachability": string;
      readonly "human-assertion": string;
      readonly "structured-field": string;
      readonly disclosure: string;
    };
    readonly deliverableBy: (creator: string, type: string) => string;
    readonly templateName: Record<DeliverableTypeKey, string>;
    /** France/EU Disclosure Checklist with three-tier severity (Story 3.3, FR-4).
     *  Framed as evidence assistance, never a compliance determination (AD-22). */
    readonly disclosure: {
      readonly checklistHeading: string;
      /** "evidence assistance — not legal advice" (NFR-D3). LOCKED copy. */
      readonly framing: string;
      readonly addLabel: string;
      /** Prefix on a checklist button whose item is already attached (disabled). */
      readonly attached: string;
      readonly name: Record<FranceEuDisclosureKey, string>;
      readonly severityLabel: string;
      readonly tier: {
        readonly unassessed: string;
        readonly evidenced: string;
        readonly ambiguous: string;
        readonly partial: string;
        readonly missing: string;
      };
      readonly capLabel: string;
      readonly cap: {
        readonly "green-eligible": string;
        readonly "caps-yellow": string;
        readonly "caps-red": string;
        readonly unassessed: string;
      };
      /** "Reflects evidence on file, not a compliance determination" — the standing
       *  verbatim caveat on any disclosure-driven Yellow/Red (AC3). LOCKED copy. */
      readonly caveat: string;
    };
  };
}

/** The three France/EU disclosure checklist keys (mirrors FRANCE_EU_DISCLOSURE in
 *  src/ruleset; local type so the catalog is exhaustively checked). */
export type FranceEuDisclosureKey =
  | "collaboration-commerciale"
  | "images-retouchees"
  | "images-virtuelles";

/** The five canonical Deliverable-type template keys (mirrors DELIVERABLE_TYPE in
 *  src/ruleset; kept as a local type so the catalog is exhaustively checked). */
export type DeliverableTypeKey =
  | "twitch-sponsor-segment"
  | "instagram-story"
  | "instagram-reel"
  | "tiktok"
  | "youtube-integration";

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
  railBadgeCount: (n) => `${n} evidence ${n === 1 ? "item" : "items"} in the Inbox`,
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
    confirm: {
      action: "Confirm page shows the Deliverable",
      ariaLabel: (deliverable) => `Confirm the resolved page shows the Deliverable: ${deliverable}`,
    },
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
      deadPrompt: "This link doesn't resolve. Capture an alternative.",
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
  inbox: {
    title: "Evidence Inbox",
    lead: "Drop any messy evidence here — nothing lands in a pile nobody sorts later.",
    addHeading: "Add evidence",
    intakeKind: {
      url: "Paste a link",
      image: "Upload a screenshot",
      text: "Paste a note",
      metric: "Upload a metric screenshot",
    },
    urlLabel: "Link",
    urlPlaceholder: "https://…",
    noteLabel: "Note",
    notePlaceholder: "Paste a message or note…",
    fileLabel: "Choose file",
    typeLabel: "Type label",
    typePlaceholder: "e.g. Twitch sponsor segment",
    clientCapturedLabel: "Captured at (optional)",
    submit: "Add to Inbox",
    submitting: "Adding…",
    error: "Couldn't add this evidence. Try again.",
    empty: "No evidence yet. Add the first receipt above.",
    listHeading: "Collected evidence",
    capturedClientLabel: "Captured",
    match: {
      helper:
        'ProofDesk suggests a match by rule. It never ranks or guesses a "most likely" — confirm or reassign. Items it can’t place stay Unassigned.',
      suggestedHeading: "Suggested match",
      byRule: "by rule",
      noMatchHeading: "No automatic match",
      unassigned: "Unassigned",
      unassignedReason: "This evidence couldn’t be matched to a single Deliverable by rule.",
      assignedHeading: "Matched",
      confirm: "Confirm",
      reassign: "Reassign",
      assign: "Assign to…",
      choose: "Choose a Deliverable…",
      undo: "Undo",
      seeded: "seeded",
      toastConfirmed: "Match confirmed.",
      toastReassigned: "Reassigned.",
      deliverable: (creator, type) => `${creator} · ${type}`,
    },
  },
  capture: {
    title: "ProofDesk Capture",
    lead: "Drop evidence into the Inbox while it still exists. It's sorted back at the desk.",
    action: {
      url: "Paste a link",
      image: "Upload a screenshot",
      text: "Paste a note",
    },
    urlLabel: "Link",
    urlPlaceholder: "https://…",
    noteLabel: "Note",
    notePlaceholder: "Paste a message or note…",
    fileLabel: "Choose a screenshot",
    typeLabel: "Type label",
    typePlaceholder: "e.g. Twitch sponsor segment",
    submit: "Capture to Inbox",
    submitting: "Capturing…",
    success: "Captured. It's in the Inbox.",
    error: "Couldn't capture this. Try again.",
  },
  proofBrief: {
    title: "Proof Brief",
    lead: "Set the proof bar per Deliverable at kickoff — so audits measure against this configured bar, not a vibe.",
    unsetHeading: "No proof bar set yet",
    unsetBody:
      "Pick a Deliverable-type template to pre-fill its Proof Requirements. Until a bar exists, an audit of this Deliverable is blocked — there's nothing to measure against.",
    pickTemplate: "Deliverable-type template",
    applyTemplate: "Apply template",
    templatePreviewHeading: "Template preview",
    provisionalBadge: "Provisional — not yet confirmed",
    provisionalNote:
      "These defaults are not yet confirmed against real platform disclosure rules. Review and adjust them before relying on this bar.",
    requirementsHeading: "Proof Requirements",
    addRequirement: "Add requirement",
    kindLabel: "Kind",
    kindPlaceholder: "e.g. proof-of-posting, reach-screenshot",
    labelLabel: "Requirement",
    labelPlaceholder: "What must be evidenced…",
    criticalityLabel: "Criticality",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    remove: "Remove",
    error: "Couldn't save that change. Try again.",
    removeBlocked: "Unassign the evidence linked to this requirement before removing it.",
    satisfiedByLabel: "Satisfied by",
    satisfaction: {
      "link-reachability": "a live link + human confirmation",
      "human-assertion": "a human assertion",
      "structured-field": "a structured field",
      disclosure: "a disclosure check",
    },
    deliverableBy: (creator, type) => `${creator} — ${type}`,
    templateName: {
      "twitch-sponsor-segment": "Twitch sponsor segment",
      "instagram-story": "Instagram Story",
      "instagram-reel": "Instagram Reel",
      tiktok: "TikTok",
      "youtube-integration": "YouTube integration",
    },
    disclosure: {
      checklistHeading: "France/EU Disclosure Checklist",
      framing: "evidence assistance — not legal advice",
      addLabel: "Add a France/EU disclosure",
      attached: "Already attached",
      name: {
        "collaboration-commerciale": "collaboration commerciale",
        "images-retouchees": "images retouchées",
        "images-virtuelles": "images virtuelles",
      },
      severityLabel: "Evidence on file",
      tier: {
        unassessed: "Not yet assessed",
        evidenced: "Visibly evidenced",
        ambiguous: "Ambiguous",
        partial: "Partially visible",
        missing: "No evidence",
      },
      capLabel: "Result",
      cap: {
        "green-eligible": "Green-eligible",
        "caps-yellow": "Caps at Caveated",
        "caps-red": "Caps at Can't-claim",
        unassessed: "Falls back to a confirmed screenshot",
      },
      caveat: "Reflects evidence on file, not a compliance determination",
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
  railBadgeCount: (n) => `${n} élément${n === 1 ? "" : "s"} de preuve dans la Boîte`,
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
    confirm: {
      action: "Confirmer que la page montre le livrable",
      ariaLabel: (deliverable) =>
        `Confirmer que la page ouverte montre le livrable : ${deliverable}`,
    },
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
      deadPrompt: "Ce lien ne répond pas. Capturez une alternative.",
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
  inbox: {
    // Locked FR glossary term (EXPERIENCE.md#L77): Evidence Inbox → Boîte à preuves.
    title: "Boîte à preuves",
    lead: "Déposez ici toute preuve, même en vrac — rien ne finit dans une pile que personne ne trie.",
    addHeading: "Ajouter une preuve",
    intakeKind: {
      url: "Coller un lien",
      image: "Téléverser une capture d’écran",
      text: "Coller une note",
      metric: "Téléverser une capture de métrique",
    },
    urlLabel: "Lien",
    urlPlaceholder: "https://…",
    noteLabel: "Note",
    notePlaceholder: "Collez un message ou une note…",
    fileLabel: "Choisir un fichier",
    typeLabel: "Étiquette de type",
    typePlaceholder: "ex. Segment sponsorisé Twitch",
    clientCapturedLabel: "Capturé le (facultatif)",
    submit: "Ajouter à la Boîte",
    submitting: "Ajout…",
    error: "Impossible d’ajouter cette preuve. Réessayez.",
    empty: "Aucune preuve pour l’instant. Ajoutez le premier élément ci-dessus.",
    listHeading: "Preuves collectées",
    capturedClientLabel: "Capturé",
    match: {
      helper:
        "ProofDesk suggère une correspondance par règle. Il ne classe jamais et ne devine pas une « plus probable » — confirmez ou réattribuez. Les éléments qu’il ne peut placer restent Non attribués.",
      suggestedHeading: "Correspondance suggérée",
      byRule: "par règle",
      noMatchHeading: "Aucune correspondance automatique",
      unassigned: "Non attribué",
      unassignedReason: "Cette preuve n’a pas pu être associée à un seul Livrable par règle.",
      assignedHeading: "Associé",
      confirm: "Confirmer",
      reassign: "Réattribuer",
      assign: "Attribuer à…",
      choose: "Choisir un Livrable…",
      undo: "Annuler",
      seeded: "amorcé",
      toastConfirmed: "Correspondance confirmée.",
      toastReassigned: "Réattribué.",
      deliverable: (creator, type) => `${creator} · ${type}`,
    },
  },
  capture: {
    title: "ProofDesk Capture",
    lead: "Déposez une preuve dans la Boîte tant qu'elle existe encore. Le tri se fait au bureau.",
    action: {
      url: "Coller un lien",
      image: "Téléverser une capture d'écran",
      text: "Coller une note",
    },
    urlLabel: "Lien",
    urlPlaceholder: "https://…",
    noteLabel: "Note",
    notePlaceholder: "Collez un message ou une note…",
    fileLabel: "Choisir une capture d'écran",
    typeLabel: "Étiquette de type",
    typePlaceholder: "ex. Segment sponsorisé Twitch",
    submit: "Capturer vers la Boîte",
    submitting: "Capture…",
    success: "Capturé. C'est dans la Boîte.",
    error: "Impossible de capturer. Réessayez.",
  },
  proofBrief: {
    title: "Cahier de preuve",
    lead: "Fixez le seuil de preuve par Livrable au lancement — pour que les audits mesurent selon ce seuil défini, pas une impression.",
    unsetHeading: "Aucun seuil de preuve défini",
    unsetBody:
      "Choisissez un modèle par type de Livrable pour pré-remplir ses Exigences de preuve. Tant qu'aucun seuil n'existe, l'audit de ce Livrable est bloqué — il n'y a rien à mesurer.",
    pickTemplate: "Modèle par type de Livrable",
    applyTemplate: "Appliquer le modèle",
    templatePreviewHeading: "Aperçu du modèle",
    provisionalBadge: "Provisoire — non confirmé",
    provisionalNote:
      "Ces valeurs par défaut ne sont pas encore confirmées au regard des règles réelles de divulgation des plateformes. Vérifiez-les et ajustez-les avant de vous y fier.",
    requirementsHeading: "Exigences de preuve",
    addRequirement: "Ajouter une exigence",
    kindLabel: "Type",
    kindPlaceholder: "ex. proof-of-posting, reach-screenshot",
    labelLabel: "Exigence",
    labelPlaceholder: "Ce qui doit être prouvé…",
    criticalityLabel: "Criticité",
    save: "Enregistrer",
    cancel: "Annuler",
    edit: "Modifier",
    remove: "Retirer",
    error: "Impossible d'enregistrer. Réessayez.",
    removeBlocked: "Dissociez la preuve liée à cette exigence avant de la retirer.",
    satisfiedByLabel: "Satisfait par",
    satisfaction: {
      "link-reachability": "un lien actif + confirmation humaine",
      "human-assertion": "une assertion humaine",
      "structured-field": "un champ structuré",
      disclosure: "un contrôle de divulgation",
    },
    deliverableBy: (creator, type) => `${creator} — ${type}`,
    templateName: {
      "twitch-sponsor-segment": "Segment sponsorisé Twitch",
      "instagram-story": "Story Instagram",
      "instagram-reel": "Reel Instagram",
      tiktok: "TikTok",
      "youtube-integration": "Intégration YouTube",
    },
    disclosure: {
      checklistHeading: "Liste de divulgation France/UE",
      framing: "assistance à la preuve — pas un conseil juridique",
      addLabel: "Ajouter une divulgation France/UE",
      attached: "Déjà ajoutée",
      name: {
        "collaboration-commerciale": "collaboration commerciale",
        "images-retouchees": "images retouchées",
        "images-virtuelles": "images virtuelles",
      },
      severityLabel: "Preuves au dossier",
      tier: {
        unassessed: "Pas encore évalué",
        evidenced: "Visiblement prouvée",
        ambiguous: "Ambiguë",
        partial: "Partiellement visible",
        missing: "Aucune preuve",
      },
      capLabel: "Résultat",
      cap: {
        "green-eligible": "Éligible au Défendable",
        "caps-yellow": "Plafonne au Sous réserve",
        "caps-red": "Plafonne au Non défendable",
        unassessed: "Repli sur une capture confirmée",
      },
      caveat: "Reflète les preuves au dossier, et non une décision de conformité",
    },
  },
};

const CATALOG: Record<Locale, Strings> = { en: EN, fr: FR };

export function localeStrings(locale: Locale): Strings {
  return CATALOG[locale];
}
