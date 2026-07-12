// src/ruleset — the France/EU Disclosure Checklist palette (Story 3.3, FR-4).
// Pure, versioned data the Proof Brief authoring surface and its tests share
// (AD-2 — nothing effectful here). These are the disclosure requirements an
// operator may attach to any Deliverable; each is a `disclosure-visible`
// requirement (satisfaction type `disclosure`), differentiated for humans by its
// label. ProofDesk NEVER asserts a compliance determination — the whole surface
// is framed "evidence assistance — not legal advice" (NFR-D3, AD-22), and the
// severity is always a Human assertion reviewing evidence on file (AD-3).
//
// ─── CONFIRMED against the actual mandated mentions (Story 3-3 GATE b/3) ───
// The three items are the three content mentions the loi n° 2023-451 (loi
// "influenceurs", 9 June 2023), art. 5, as amended by the ordonnance of 6 Nov
// 2024, requires "claires, lisibles et identifiables" on the content:
//   1. "Publicité" / "Collaboration commerciale" — commercial-partnership label
//      (equivalent mentions allowed since the 2024 ordonnance).
//   2. "Images retouchées" — silhouette/face-altered images.
//   3. "Images virtuelles" — AI-generated faces/silhouettes.
// The epic's placeholder third item "influenceur" was NOT a real mandated label
// and was corrected to "images virtuelles" — empty-and-honest over
// populated-and-guessed. Source: Légifrance JORFTEXT000047663185 (art. 5).

import type { Criticality } from "@/src/schema/enums";

/** Canonical keys for the France/EU disclosure checklist items (kebab-case;
 *  glossary English in code). Each maps to a verbatim French mandated mention. */
export const FRANCE_EU_DISCLOSURE = [
  "collaboration-commerciale",
  "images-retouchees",
  "images-virtuelles",
] as const;
export type FranceEuDisclosure = (typeof FRANCE_EU_DISCLOSURE)[number];

export interface FranceEuDisclosureSpec {
  key: FranceEuDisclosure;
  /** All France/EU disclosure items use the `disclosure` satisfaction kind — the
   *  audit reads the three-tier `disclosureState`, not the kind, for severity. */
  kind: "disclosure-visible";
  /** Disclosure requirements are `critical` by default (a missing required
   *  disclosure caps the Claim at Red); the operator may re-classify like any
   *  requirement. */
  criticality: Criticality;
  /** The verbatim French mandated mention (loi Influenceurs art. 5). Persisted as
   *  the row's reference label; the localized display name lives in i18n. */
  label: string;
  /** true → the mandated mention renders VERBATIM French even inside an EN
   *  surface, wrapped `<span lang="fr">` (screen-reader pronunciation). All three
   *  are the exact legally-required French strings, so all are verbatim. */
  verbatimFrench: boolean;
}

export const FRANCE_EU_DISCLOSURES: Readonly<Record<FranceEuDisclosure, FranceEuDisclosureSpec>> = {
  "collaboration-commerciale": {
    key: "collaboration-commerciale",
    kind: "disclosure-visible",
    criticality: "critical",
    label: "collaboration commerciale",
    verbatimFrench: true,
  },
  "images-retouchees": {
    key: "images-retouchees",
    kind: "disclosure-visible",
    criticality: "critical",
    label: "images retouchées",
    verbatimFrench: true,
  },
  "images-virtuelles": {
    key: "images-virtuelles",
    kind: "disclosure-visible",
    criticality: "critical",
    label: "images virtuelles",
    verbatimFrench: true,
  },
};

/** The disclosure spec for a key, for the authoring service + Route Handler. */
export function franceEuDisclosure(key: FranceEuDisclosure): FranceEuDisclosureSpec {
  return FRANCE_EU_DISCLOSURES[key];
}

/** Narrow a persisted `disclosure_key` string (nullable, plain text) to a known
 *  checklist key — so the UI localizes a known item and safely falls back for an
 *  unknown/absent value. */
export function isFranceEuDisclosure(
  value: string | null | undefined,
): value is FranceEuDisclosure {
  // Own-property check — never the prototype chain, so a persisted value like
  // "toString" or "__proto__" can't be misclassified as a real disclosure key.
  return value != null && Object.hasOwn(FRANCE_EU_DISCLOSURES, value);
}
