import type { Locale } from "@/app/_lib/i18n";

/**
 * AI-9 teaching layer: the ONE place each Record term's plain-language
 * definition is written. Tooltip, empty states, and (future) explainer all
 * read from here so a term cannot mean one thing on hover and another elsewhere.
 * Record terms keep their precise labels (no rename until the AI-9 validation
 * gate); only the plain DEFINITION is added here. No em/en-dashes (copy rule).
 */
export type TermKey =
  | "claim"
  | "defensible"
  | "caveated"
  | "cant-claim"
  | "caveat"
  | "machine-checked"
  | "human-assertion";

export interface TermEntry {
  readonly label: Record<Locale, string>;
  readonly definition: Record<Locale, string>;
}

export const TERM_GLOSSARY: Record<TermKey, TermEntry> = {
  claim: {
    label: { en: "claim", fr: "revendication" },
    definition: {
      en: "Something a creator said they delivered, like 'posted 3 stories' or 'reached 40k people.' ProofDesk checks each one against evidence.",
      fr: "Ce qu'un créateur affirme avoir livré, comme « 3 stories publiées » ou « 40k personnes touchées ». ProofDesk vérifie chacune face aux preuves.",
    },
  },
  defensible: {
    label: { en: "Defensible", fr: "Défendable" },
    definition: {
      en: "You can back this claim with evidence that holds up. It goes to the client as-is.",
      fr: "Vous pouvez appuyer cette revendication sur des preuves solides. Elle part au client telle quelle.",
    },
  },
  caveated: {
    label: { en: "Caveated", fr: "Sous réserve" },
    definition: {
      en: "Backed, but with a limit worth stating. It goes to the client with the caveat attached.",
      fr: "Appuyée, mais avec une limite à signaler. Elle part au client avec la réserve jointe.",
    },
  },
  "cant-claim": {
    label: { en: "Can't claim", fr: "Non défendable" },
    definition: {
      en: "The evidence isn't there yet, so ProofDesk won't let you present this as proven.",
      fr: "La preuve n'est pas encore là : ProofDesk ne vous laisse pas la présenter comme prouvée.",
    },
  },
  caveat: {
    label: { en: "caveat", fr: "réserve" },
    definition: {
      en: "A short, honest limit on a claim, like 'reach is a creator screenshot, not a verified figure.'",
      fr: "Une limite courte et honnête sur une revendication, comme « la portée est une capture du créateur, pas un chiffre vérifié ».",
    },
  },
  "machine-checked": {
    label: { en: "Machine-checked fact", fr: "Fait vérifié par la machine" },
    definition: {
      en: "ProofDesk verified this itself, like confirming a link is live, so it doesn't rest on anyone's word.",
      fr: "ProofDesk l'a vérifié lui-même, par exemple qu'un lien fonctionne, sans reposer sur la parole de quiconque.",
    },
  },
  "human-assertion": {
    label: { en: "Human assertion", fr: "Affirmation humaine" },
    definition: {
      en: "A person stated this. ProofDesk records who and when but can't verify it, and shows that plainly.",
      fr: "Une personne l'a affirmé. ProofDesk note qui et quand mais ne peut pas le vérifier, et l'indique clairement.",
    },
  },
};

export const TERM_KEYS = Object.keys(TERM_GLOSSARY) as TermKey[];

export function termLabel(locale: Locale, key: TermKey): string {
  return TERM_GLOSSARY[key].label[locale];
}

export function termDefinition(locale: Locale, key: TermKey): string {
  return TERM_GLOSSARY[key].definition[locale];
}
