// src/services/evidence-matching — the deterministic Evidence→Deliverable
// matcher and the operator-affirmation orchestration (Story 2.2, FR-6, AD-17).
//
// TWO honesty invariants are structural here, not copy:
//   1. The matcher is DETERMINISTIC rules only — owned URL/platform + handle
//      string matching. NO ML, NO confidence score, NO ranking, NO "most likely"
//      (AD-17, FR-6). Its output is a boolean match to exactly ONE Deliverable
//      plus the rule that fired (auditable) — or Unassigned. Nothing rankable.
//   2. The matcher writes a `MatchSuggestion` ONLY (a distinct row type). It
//      NEVER writes an EvidenceLink. Only an operator, by Confirming/Reassigning,
//      writes an `EvidenceLink source=operator` — and only those enter the
//      AuditSnapshot (AD-16/AD-17). The core never sees suggestions.
//
// No outbound HTTP: the URL rule is pure string parsing; fetching a link is the
// verification adapter's job (Story 2.4). This module imports no HTTP client.

import {
  campaignIdOfProofRequirement,
  createEvidenceLink,
  createMatchSuggestion,
  type Db,
  deleteMatchSuggestionsForEvidence,
  deleteOperatorEvidenceLinksForItem,
  getEvidenceItem,
  getMatchSuggestionForEvidence,
  getOperatorAssignmentForEvidence,
  listDeliverableMatchCandidates,
  MixedOriginError,
  matchTargetRequirementId,
} from "@/src/repositories";
import type { EvidenceItemView } from "./evidence-ingest";

// --- The pure matcher ------------------------------------------------------

/** One Deliverable the matcher can consider, with its two matching keys. */
export interface MatchCandidate {
  deliverableId: string;
  creatorName: string;
  creatorHandle: string | null;
  deliverableType: string;
  platformUrl: string | null;
}

/** The stored content of an EvidenceItem the matcher reads — no HTTP, no fetch. */
export interface MatchInput {
  url: string | null;
  note: string | null;
}

/** The matcher's result. Exactly-one Deliverable → `matched`, carrying the rule
 *  that fired (inspectable/auditable); zero or multiple → Unassigned. There is
 *  DELIBERATELY no score/confidence/rank field anywhere (AD-17). */
export type MatchOutcome =
  | { matched: true; deliverableId: string; rule: string }
  | { matched: false };

/** Normalise a URL for prefix comparison: lower-case, drop scheme, a leading
 *  `www.`, a trailing slash, and any query/fragment. Best-effort — a value that
 *  is not a parseable URL is normalised as a bare lower-cased string so a pasted
 *  non-URL never throws. Pure string work; no network. */
export function normaliseUrl(value: string): string {
  const trimmed = value.trim().toLowerCase();
  let host = "";
  let path = "";
  try {
    const u = new URL(trimmed);
    host = u.host.replace(/^www\./, "");
    path = u.pathname;
  } catch {
    // Not a full URL — strip a leading scheme-ish prefix and a `www.`, keep the
    // rest as an opaque host+path blob.
    const stripped = trimmed.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
    const slash = stripped.indexOf("/");
    host = slash === -1 ? stripped : stripped.slice(0, slash);
    path = slash === -1 ? "" : stripped.slice(slash);
  }
  return `${host}${path}`.replace(/\/+$/, "");
}

/** True when `itemUrl` is the deliverable's platform URL or a sub-path of it
 *  (path-boundary aware, so `.../aurora-1` never matches `.../aurora-12`). */
function urlBelongsTo(itemNorm: string, platformNorm: string): boolean {
  return itemNorm === platformNorm || itemNorm.startsWith(`${platformNorm}/`);
}

/** True when `handle` appears as a whole token in the haystack (non-alphanumeric
 *  boundaries), so `pixelforge` matches `twitch.tv/pixelforge` and `@pixelforge`
 *  but not `pixelforgery`. Pure — the handle is a matching key, never a score. */
function handleAppears(handle: string, haystack: string): boolean {
  const h = handle.toLowerCase();
  let i = haystack.indexOf(h);
  while (i !== -1) {
    const before = i === 0 ? "" : haystack[i - 1];
    const after = i + h.length >= haystack.length ? "" : haystack[i + h.length];
    const boundaryBefore = before === "" || !/[a-z0-9]/.test(before);
    const boundaryAfter = after === "" || !/[a-z0-9]/.test(after);
    if (boundaryBefore && boundaryAfter) return true;
    i = haystack.indexOf(h, i + 1);
  }
  return false;
}

/**
 * Deterministically match an EvidenceItem to exactly one Deliverable, or leave
 * it Unassigned (FR-6, AD-17). Rule precedence (specific → general), each rule
 * must resolve to exactly ONE Deliverable to fire:
 *
 *   1. URL rule — the item's link is/sub-paths a Deliverable's `platform_url`.
 *      If exactly one Deliverable matches → suggest it. If several do → the URL
 *      is ambiguous → Unassigned (never a guess).
 *   2. Handle rule (only if the URL rule found nothing) — a Creator's handle
 *      appears in the item's url/note. If that maps to exactly one Deliverable
 *      → suggest it; if the handle's Creator owns several Deliverables (or
 *      several Creators match) → Unassigned.
 *
 * This is longest-boundary specificity, not ranking: no result is ever ordered
 * by likelihood; a rule either identifies a single Deliverable or it does not.
 */
export function matchEvidence(input: MatchInput, candidates: MatchCandidate[]): MatchOutcome {
  // Rule 1 — platform URL.
  if (input.url) {
    const itemNorm = normaliseUrl(input.url);
    const urlHits = candidates.filter(
      (c) => c.platformUrl && urlBelongsTo(itemNorm, normaliseUrl(c.platformUrl)),
    );
    const urlIds = [...new Set(urlHits.map((c) => c.deliverableId))];
    if (urlIds.length === 1) {
      const hit = urlHits.find((c) => c.deliverableId === urlIds[0]);
      return {
        matched: true,
        deliverableId: urlIds[0],
        rule: `url:${normaliseUrl(hit?.platformUrl ?? "")}`,
      };
    }
    if (urlIds.length > 1) return { matched: false }; // ambiguous URL
  }

  // Rule 2 — creator handle in url/note.
  const haystack = `${input.url ?? ""} ${input.note ?? ""}`.toLowerCase();
  const handleHits = candidates.filter(
    (c) => c.creatorHandle && handleAppears(c.creatorHandle, haystack),
  );
  const handleIds = [...new Set(handleHits.map((c) => c.deliverableId))];
  if (handleIds.length === 1) {
    const hit = handleHits.find((c) => c.deliverableId === handleIds[0]);
    return { matched: true, deliverableId: handleIds[0], rule: `handle:@${hit?.creatorHandle}` };
  }

  return { matched: false };
}

// --- Orchestration: run the matcher, write a MatchSuggestion ---------------

/** A suggested-match view for the inbox card (Story 2.2, AC2). It carries the
 *  Deliverable + Creator and the rule that fired — and no score/ranking. */
export interface SuggestionView {
  deliverableId: string;
  creatorName: string;
  deliverableType: string;
  /** The deterministic rule that fired, e.g. `url:twitch.tv/…` — inspectable. */
  rule: string;
}

/** An operator assignment view for the inbox card (Story 2.2, AC3/AC5). */
export interface AssignmentView {
  evidenceLinkId: string;
  deliverableId: string;
  creatorName: string;
  deliverableType: string;
}

/** The per-item match state the inbox renders: assigned (operator link),
 *  suggested (unaffirmed MatchSuggestion), or unassigned. */
export type MatchState =
  | { status: "assigned"; assignment: AssignmentView }
  | { status: "suggested"; suggestion: SuggestionView }
  | { status: "unassigned" };

/** An Evidence Inbox card: the 2.1 receipt view plus its 2.2 match state. */
export interface InboxItemView extends EvidenceItemView {
  match: MatchState;
}

/** A Deliverable choice for the Reassign / Assign-to-Deliverable picker. */
export interface DeliverableOption {
  deliverableId: string;
  creatorName: string;
  deliverableType: string;
}

/**
 * Run the deterministic matcher over one ingested EvidenceItem and (re)write its
 * single MatchSuggestion. Idempotent: any prior suggestion for the item is
 * cleared first, so re-running never accumulates rows. Returns the suggestion
 * view, or null when the item stays Unassigned. Writes a `MatchSuggestion` ONLY
 * — never an EvidenceLink (AD-17). No-op (returns null) if the item is unknown or
 * already operator-assigned (a machine re-run must never disturb an operator's
 * decision).
 */
export function runMatchForEvidenceItem(db: Db, evidenceItemId: string): SuggestionView | null {
  const item = getEvidenceItem(db, evidenceItemId);
  if (!item) return null;
  // Never overwrite an operator decision with a machine suggestion.
  if (getOperatorAssignmentForEvidence(db, evidenceItemId)) return null;

  deleteMatchSuggestionsForEvidence(db, evidenceItemId);

  const candidates = listDeliverableMatchCandidates(db, item.campaignId);
  const outcome = matchEvidence({ url: item.url, note: item.note }, candidates);
  if (!outcome.matched) return null;

  const target = matchTargetRequirementId(db, outcome.deliverableId);
  if (!target) return null; // Deliverable with no ProofRequirement — nothing to link.
  createMatchSuggestion(db, { evidenceItemId, proofRequirementId: target, rule: outcome.rule });

  const c = candidates.find((x) => x.deliverableId === outcome.deliverableId);
  return {
    deliverableId: outcome.deliverableId,
    creatorName: c?.creatorName ?? "",
    deliverableType: c?.deliverableType ?? "",
    rule: outcome.rule,
  };
}

/**
 * Operator affirmation: attach an EvidenceItem to a Deliverable as an
 * `EvidenceLink source=operator` (AD-17). Used by both Confirm (the suggested
 * Deliverable) and Reassign (an operator-chosen Deliverable) — one write path,
 * so an item ends with EXACTLY ONE operator link (any prior operator link for the
 * item is cleared first) or stays Unassigned. `source` is set here on the server,
 * never from the request. The consumed MatchSuggestion is removed. Returns null
 * for an unknown item/Deliverable (the route maps that to 404).
 */
export function assignEvidence(
  db: Db,
  input: { evidenceItemId: string; deliverableId: string },
): AssignmentView | null {
  const item = getEvidenceItem(db, input.evidenceItemId);
  if (!item) return null;
  const target = matchTargetRequirementId(db, input.deliverableId);
  if (!target) return null;

  // Reject a cross-campaign assignment BEFORE any mutation. createEvidenceLink
  // re-checks this (AD-9), but it throws only AFTER the delete below would have
  // run — a rejected reassign must never silently drop the item's existing valid
  // operator link (data-loss). Guarding here keeps the whole op all-or-nothing.
  if (campaignIdOfProofRequirement(db, target) !== item.campaignId) {
    throw new MixedOriginError(
      `Cross-campaign assignment rejected: evidence item in ${item.campaignId}, Deliverable in another campaign (AD-9)`,
    );
  }

  // Exactly-one invariant: replace any existing operator link for this item.
  deleteOperatorEvidenceLinksForItem(db, input.evidenceItemId);
  const link = createEvidenceLink(db, {
    evidenceItemId: input.evidenceItemId,
    proofRequirementId: target,
    source: "operator",
  });
  // The suggestion has been affirmed into a link; it has served its purpose.
  deleteMatchSuggestionsForEvidence(db, input.evidenceItemId);

  const assignment = getOperatorAssignmentForEvidence(db, input.evidenceItemId);
  return (
    assignment ?? {
      evidenceLinkId: link.id,
      deliverableId: input.deliverableId,
      creatorName: "",
      deliverableType: "",
    }
  );
}

/**
 * Reverse an assignment: drop the operator EvidenceLink(s) for an item and
 * re-run the matcher so a suggestion is restored where one exists (NFR-D7 —
 * actions are reversible). Returns the resulting match state.
 */
export function unassignEvidence(db: Db, evidenceItemId: string): MatchState | null {
  const item = getEvidenceItem(db, evidenceItemId);
  if (!item) return null;
  deleteOperatorEvidenceLinksForItem(db, evidenceItemId);
  const suggestion = runMatchForEvidenceItem(db, evidenceItemId);
  return suggestion ? { status: "suggested", suggestion } : { status: "unassigned" };
}

/** The campaign's Deliverables as picker options (Reassign / Assign), grouped in
 *  the UI by Creator. Read-only. */
export function listDeliverableOptions(db: Db, campaignId: string): DeliverableOption[] {
  return listDeliverableMatchCandidates(db, campaignId).map((c) => ({
    deliverableId: c.deliverableId,
    creatorName: c.creatorName,
    deliverableType: c.deliverableType,
  }));
}

/** Enrich a 2.1 receipt view with its current match state (read-only). */
export function toInboxItemView(db: Db, view: EvidenceItemView): InboxItemView {
  return { ...view, match: readMatchState(db, view.id) };
}

/** The current match state of an item for the inbox render (read-only). */
export function readMatchState(db: Db, evidenceItemId: string): MatchState {
  const assignment = getOperatorAssignmentForEvidence(db, evidenceItemId);
  if (assignment) return { status: "assigned", assignment };
  const suggestion = getMatchSuggestionForEvidence(db, evidenceItemId);
  if (suggestion) {
    return {
      status: "suggested",
      suggestion: {
        deliverableId: suggestion.deliverableId,
        creatorName: suggestion.creatorName,
        deliverableType: suggestion.deliverableType,
        rule: suggestion.rule ?? "",
      },
    };
  }
  return { status: "unassigned" };
}
