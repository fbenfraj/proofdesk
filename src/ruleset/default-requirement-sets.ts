// src/ruleset — the default critical/supporting Proof Requirement set per
// Deliverable type (AD-13, FR-9, PRD §14.5). Versioned TS constants (NOT config
// files, NOT a DB-driven table). Pure data the Proof Brief (Story 3.2) pre-fills
// and the operator then edits per Campaign; the pure core reads `criticality`
// off each requirement (AD-13) and resolves its satisfaction predicate from
// `kind` via the taxonomy (AD-19).
//
// ─── CONFIRMED (Story 3-3 closing GATE b/3, 2026-07-12) ───
// GATE b/3 required these default sets be confirmed against ACTUAL platform
// disclosure rules before Story 3-3 could close. Confirmation basis:
//   • The required France/EU DISCLOSURE (the `disclosure-visible` critical member
//     of every set) is grounded in the loi n° 2023-451 (loi "influenceurs",
//     9 June 2023), art. 5 (as amended by the ordonnance of 6 Nov 2024): a
//     commercial partnership must carry "Publicité"/"Collaboration commerciale",
//     retouched images "Images retouchées", AI images "Images virtuelles" —
//     "claires, lisibles et identifiables" throughout. Source: Légifrance
//     JORFTEXT000047663185. Enforced by ARPP/DGCCRF (2024-2025 controls found
//     20-46% non-disclosure) — see planning-artifacts/research.
//   • The proof-bar STRUCTURE per Deliverable type (link resolves + operator
//     confirmation, segment/integration timestamp, ephemeral durable-capture,
//     reach/metric screenshots) is ProofDesk's proof-of-DELIVERY bar, grounded in
//     the domain research (ephemeral capture, forgeable screenshots, VOD windows),
//     NOT a legal mandate. It evidences delivery, never a compliance outcome
//     (AD-22) — the "evidence assistance — not legal advice" disclaimer stands.
// Confirming here does NOT remove that disclaimer and does NOT stand in for the
// separate mandatory French LEGAL REVIEW that still gates any paid pilot on real
// client data. Where a real rule was not confirmable it was left out, never
// fabricated (the epic placeholder "influenceur" disclosure was replaced with the
// real "images virtuelles" mention — see france-eu-disclosures.ts).
//
// ─── DEMOTIONS (Epic 3 retro, 2026-07-12 — AI-2) ───
// Confirmation is per-requirement, not blanket. Two supporting placeholders wore
// `confirmed: true` without grounding and were demoted to `confirmed: false` with
// a `note` (see `provisionalSupporting`):
//   • instagram-reel `reach-screenshot` — the "within 48h" window was unsourced
//     (asymmetric with every other set's window-free reach-screenshot); number
//     stripped, demoted provisional.
//   • twitch `channel-match` — Twitch-only scoping was stated nowhere; demoted
//     provisional, flagged rationale-or-removal.
// The disclosure critical (loi Influenceurs art. 5) and the proof-of-delivery
// structure stay confirmed. The full typed-`source` mechanism that makes an
// unsourced `confirmed` impossible to construct is AI-1b (an Epic 4 story AC).

import type { Criticality } from "@/src/schema/enums";
import { DELIVERABLE_TYPE, type DeliverableType } from "./deliverable-types";

/** One default requirement in a Deliverable-type template. `kind` resolves to a
 *  satisfaction type via `satisfactionTypeOf` (AD-19); `criticality` drives the
 *  R/Y/G threshold in the core (AD-13). `label` is an English glossary string —
 *  UI localization is Story 3.2/3.3, not here. */
export interface DefaultProofRequirement {
  kind: string;
  criticality: Criticality;
  label: string;
  /** GATE b/3: `true` once reviewed and adopted as a confirmed default. The
   *  disclosure requirement is additionally grounded in the loi Influenceurs
   *  (see the file header); the proof-bar requirements are confirmed product
   *  defaults for proof-of-delivery, never a legal determination. A `false`
   *  here MUST carry a `note` saying what is missing (Epic 3 retro AI-2) —
   *  an unconfirmed default with no stated reason is populated-and-guessed. */
  confirmed: boolean;
  /** Required when `confirmed` is false: what grounding is missing and what
   *  would restore it. Descriptive provenance only — deliberately NOT part of
   *  the campaign-override identity hash (see `canonicalizeRequirement`). The
   *  full typed-`source` mechanism is AI-1b (Epic 4). */
  note?: string;
}

/** The default Proof Requirement set for one Deliverable type. `provisional`
 *  false = reviewed and adopted (GATE b/3 retired); true would re-surface the
 *  "provisional — not yet confirmed" UI state for any future unconfirmed set. */
export interface DeliverableTypeDefaults {
  deliverableType: DeliverableType;
  provisional: boolean;
  requirements: readonly DefaultProofRequirement[];
}

/** Shorthand — every shipped requirement is a confirmed default (GATE b/3). */
function critical(kind: string, label: string): DefaultProofRequirement {
  return { kind, criticality: "critical", label, confirmed: true };
}
function supporting(kind: string, label: string): DefaultProofRequirement {
  return { kind, criticality: "supporting", label, confirmed: true };
}

/** A supporting default that is deliberately NOT confirmed — it carries a
 *  provenance gap the owner has not closed. Demoted per Epic 3 retro AI-2:
 *  an unsourced placeholder must not wear `confirmed`. The `note` states what
 *  is missing and what would restore confirmation. */
function provisionalSupporting(kind: string, label: string, note: string): DefaultProofRequirement {
  return { kind, criticality: "supporting", label, confirmed: false, note };
}

// The France/EU disclosure critical is a required member of every set. Its
// three-tier severity + the verbatim "collaboration commerciale" FR label +
// "evidence assistance — not legal advice" framing are Story 3.3 — here it is
// only the required critical disclosure slot (kind `disclosure-visible`).
const DISCLOSURE = () =>
  critical("disclosure-visible", "Required France/EU disclosure visibly evidenced");

/**
 * Default critical + supporting sets per Deliverable type. Membership is taken
 * verbatim from epics.md#Story 3.1 (lines 630-638); nothing is added to "look
 * complete". "Link resolves + HumanConfirmation the page shows the Deliverable"
 * is ONE `proof-of-posting` requirement (the core's AD-5 predicate already
 * requires BOTH a `live` link AND a confirmation on that same link) — never two
 * rows, and never a standalone "human-confirmation" kind.
 */
export const DEFAULT_REQUIREMENT_SETS: Readonly<Record<DeliverableType, DeliverableTypeDefaults>> =
  {
    "twitch-sponsor-segment": {
      deliverableType: "twitch-sponsor-segment",
      provisional: false,
      requirements: [
        critical(
          "proof-of-posting",
          "VOD/clip link resolves (live) and operator confirms the page shows the sponsor segment",
        ),
        critical("segment-timestamp-field", "Sponsor segment timestamp recorded"),
        DISCLOSURE(),
        supporting("viewer-figure", "Viewer/CCV figure (Human assertion)"),
        provisionalSupporting(
          "channel-match",
          "Channel matches the creator",
          "Twitch-only scoping stated nowhere — why here but not IG/TikTok/YouTube? Rationale-or-removal (AI-2): reconfirm only with a stated Twitch-identity basis that either generalizes to the other platforms or earns a Twitch-specific judgment source; no stated reason → drop.",
        ),
        supporting("reach-screenshot", "Reach screenshot"),
      ],
    },
    "instagram-story": {
      deliverableType: "instagram-story",
      provisional: false,
      requirements: [
        // Ephemeral: an expired Story with no durable capture is Red — so the
        // durable capture (carrying the operator's confirmation the Story ran) is
        // the critical bar, not a link (there is no durable link).
        critical(
          "durable-capture",
          "Durable capture (screenshot/clip) with operator confirmation the Story ran",
        ),
        DISCLOSURE(),
        supporting("reach-screenshot", "Reach screenshot"),
      ],
    },
    "instagram-reel": {
      deliverableType: "instagram-reel",
      provisional: false,
      requirements: [
        critical(
          "proof-of-posting",
          "Reel link resolves (live) and operator confirms the page shows the Reel",
        ),
        DISCLOSURE(),
        provisionalSupporting(
          "reach-screenshot",
          "Reach screenshot",
          'Window unspecified — the earlier "within 48h" carried no sourced basis for why a window exists or why Reel-only (every other set\'s reach-screenshot is window-free). Number stripped; provisional pending a sourced basis (AI-2).',
        ),
      ],
    },
    tiktok: {
      deliverableType: "tiktok",
      provisional: false,
      requirements: [
        critical(
          "proof-of-posting",
          "TikTok link resolves (live) and operator confirms the page shows the post",
        ),
        DISCLOSURE(),
        supporting("metric-screenshot", "Metric screenshot"),
      ],
    },
    "youtube-integration": {
      deliverableType: "youtube-integration",
      provisional: false,
      requirements: [
        critical(
          "proof-of-posting",
          "Video link resolves (live) and operator confirms the page shows the sponsor integration",
        ),
        critical("segment-timestamp-field", "Integration timestamp recorded"),
        DISCLOSURE(),
        supporting("viewer-figure", "View figure (Human assertion)"),
      ],
    },
  };

/** Pure accessor — the confirmed default set for a Deliverable type (GATE b/3). */
export function defaultRequirementsFor(type: DeliverableType): DeliverableTypeDefaults {
  return DEFAULT_REQUIREMENT_SETS[type];
}

/** All Deliverable types that ship a default set (stable order). */
export const DELIVERABLE_TYPES_WITH_DEFAULTS: readonly DeliverableType[] = DELIVERABLE_TYPE;
