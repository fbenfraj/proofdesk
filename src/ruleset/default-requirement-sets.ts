// src/ruleset — the default critical/supporting Proof Requirement set per
// Deliverable type (AD-13, FR-9, PRD §14.5). Versioned TS constants (NOT config
// files, NOT a DB-driven table). Pure data the Proof Brief (Story 3.2) pre-fills
// and the operator then edits per Campaign; the pure core reads `criticality`
// off each requirement (AD-13) and resolves its satisfaction predicate from
// `kind` via the taxonomy (AD-19).
//
// ─── PROVISIONAL — DO NOT TREAT AS AUTHORITATIVE (Story 3.3 closing GATE b/3) ───
// Every set below is `provisional` and every requirement is `confirmed: false`.
// Membership is the ONE rule the architecture leaves to firm up against real
// campaigns (SPINE §Deferred). The Epic-2 retro made "confirm these against
// ACTUAL platform disclosure rules" a hard precondition on closing Story 3.3:
// until then, a consumer MUST surface a "provisional — not yet confirmed" state
// and NEVER present the bar as settled. Where a real platform rule is not
// confirmable, leave the slot UNSET rather than fabricate one — empty-and-honest
// beats populated-and-guessed. A guessed proof bar under a confident checklist is
// capability-dishonesty wearing a UI (AD-3).

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
  /** GATE b/3: `false` until this requirement is confirmed against a real
   *  platform disclosure rule. Ships `false` everywhere in Story 3.1. */
  confirmed: false;
}

/** The default Proof Requirement set for one Deliverable type. `provisional` is
 *  a compile-time-fixed `true`: no Story-3.1 set is authoritative. */
export interface DeliverableTypeDefaults {
  deliverableType: DeliverableType;
  provisional: true;
  requirements: readonly DefaultProofRequirement[];
}

/** Shorthand — every requirement ships unconfirmed (GATE b/3). */
function critical(kind: string, label: string): DefaultProofRequirement {
  return { kind, criticality: "critical", label, confirmed: false };
}
function supporting(kind: string, label: string): DefaultProofRequirement {
  return { kind, criticality: "supporting", label, confirmed: false };
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
      provisional: true,
      requirements: [
        critical(
          "proof-of-posting",
          "VOD/clip link resolves (live) and operator confirms the page shows the sponsor segment",
        ),
        critical("segment-timestamp-field", "Sponsor segment timestamp recorded"),
        DISCLOSURE(),
        supporting("viewer-figure", "Viewer/CCV figure (Human assertion)"),
        supporting("channel-match", "Channel matches the creator"),
        supporting("reach-screenshot", "Reach screenshot"),
      ],
    },
    "instagram-story": {
      deliverableType: "instagram-story",
      provisional: true,
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
      provisional: true,
      requirements: [
        critical(
          "proof-of-posting",
          "Reel link resolves (live) and operator confirms the page shows the Reel",
        ),
        DISCLOSURE(),
        supporting("reach-screenshot", "Reach screenshot within 48h"),
      ],
    },
    tiktok: {
      deliverableType: "tiktok",
      provisional: true,
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
      provisional: true,
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

/** Pure accessor — the provisional default set for a Deliverable type. */
export function defaultRequirementsFor(type: DeliverableType): DeliverableTypeDefaults {
  return DEFAULT_REQUIREMENT_SETS[type];
}

/** All Deliverable types that ship a default set (stable order). */
export const DELIVERABLE_TYPES_WITH_DEFAULTS: readonly DeliverableType[] = DELIVERABLE_TYPE;
