// src/core — the PURE audit engine (AD-1, AD-16). `audit(snapshot)` is a pure
// function of an AuditSnapshot: it returns `{ verdict, trace }` with NO
// Date.now(), NO DB/network/file access, and it NEVER re-classifies a value the
// shell already resolved (liveness label, satisfaction, confirmation). It is a
// hand-rolled decision table over Specification-pattern per-requirement
// predicates — no rules-engine library. It imports ONLY types (erased at
// runtime) and the versioned ruleset taxonomy (AD-19) — nothing effectful (AD-2).
//
// This is the product's IP and its honesty guarantee. Determinism and
// idempotency fall out of purity for free (NFR-D2).

import { satisfactionTypeOf } from "@/src/ruleset";
import type {
  AuditSnapshot,
  SnapshotProofRequirement,
  TraceEntry,
} from "@/src/schema/audit-snapshot";
import type { ProofStatus } from "@/src/schema/enums";

/** The verdict + its decomposed, machine-vs-human trace (AD-4, AD-6). */
export interface AuditVerdict {
  verdict: ProofStatus;
  trace: TraceEntry[];
}

/** Per-requirement decision outcome fed to the decision table. `capsAtYellow`
 *  means: this requirement, though not Red-causing, holds the Claim below Green
 *  (a critical met only on a human assertion, an ambiguous disclosure, or a
 *  missing supporting requirement — AC-2). */
interface RequirementEvaluation {
  satisfied: boolean;
  capsAtYellow: boolean;
  trace: TraceEntry[];
}

/**
 * Deterministically evaluate one Claim's snapshot into a Proof Status + trace.
 *
 * Decision table (AC-2):
 *   - any CRITICAL requirement unmet            → Red
 *   - else any requirement caps at Yellow       → Yellow
 *   - else                                       → Green
 */
export function audit(snapshot: AuditSnapshot): AuditVerdict {
  // No proof bar defined → nothing evidences delivery. An empty requirement set
  // must NEVER be Green: with no critical requirement to be "unmet" the decision
  // table would fall through to a vacuous-truth false pass. The honest floor is
  // Red with an explicit reason. The Proof Brief (Story 3.2) treats an unset
  // Deliverable as blocked for exactly this reason — "audits are blocked/
  // meaningless until a bar exists" (AC4). Reachable only once requirements can
  // be authored/removed (Story 3.2); the seed always ships a bar, so seeded
  // verdicts are unaffected.
  if (snapshot.claim.requirements.length === 0) {
    return {
      verdict: "red",
      trace: [
        {
          requirementId: "",
          satisfied: false,
          reason:
            "No Proof Requirements defined — the proof bar is unset, so delivery is unproven.",
          machineOrHuman: "machine",
        },
      ],
    };
  }

  const results = snapshot.claim.requirements.map((req) => ({
    req,
    ev: evaluateRequirement(req),
  }));

  const trace = results.flatMap((r) => r.ev.trace);

  const criticalUnmet = results.some((r) => r.req.criticality === "critical" && !r.ev.satisfied);
  if (criticalUnmet) return { verdict: "red", trace };

  const capped = results.some((r) => r.ev.capsAtYellow);
  return { verdict: capped ? "yellow" : "green", trace };
}

/** Route a requirement to its Specification predicate by satisfaction type
 *  (AD-19). The core applies the taxonomy; it does not re-derive it per row. */
function evaluateRequirement(req: SnapshotProofRequirement): RequirementEvaluation {
  switch (satisfactionTypeOf(req.kind)) {
    case "link-reachability":
      return evalLinkReachability(req);
    case "disclosure":
      return evalDisclosure(req);
    case "structured-field":
      return evalStructuredField(req);
    default:
      return evalHumanAssertion(req);
  }
}

/** proof-of-posting (AD-5): satisfied by BOTH machine reachability (`live`) AND
 *  a recorded HumanConfirmation that the *same* page shows the Deliverable. The
 *  liveness and the confirmation must live on ONE link — they can never be
 *  combined across links. We report on the strongest single link: a
 *  live+confirmed link → Green-eligible; a confirmed-but-not-live link is "met"
 *  on the creator's word and caps at Yellow; no confirmed link at all is unmet.
 *  Only `live` satisfies the machine half (AD-5). */
function evalLinkReachability(req: SnapshotProofRequirement): RequirementEvaluation {
  const isLive = (l: SnapshotProofRequirement["operatorEvidence"][number]) =>
    l.livenessLabel === "live";
  const isConfirmed = (l: SnapshotProofRequirement["operatorEvidence"][number]) =>
    l.humanConfirmations.length > 0;

  // Strongest single link: a live+confirmed one, else any confirmed one, else
  // any live one, else nothing. The verdict is read off this one link, so a
  // `live` label and a confirmation on DIFFERENT links can never make Green.
  const rep =
    req.operatorEvidence.find((l) => isLive(l) && isConfirmed(l)) ??
    req.operatorEvidence.find(isConfirmed) ??
    req.operatorEvidence.find(isLive) ??
    null;

  const live = rep != null && isLive(rep);
  const confirmed = rep != null && isConfirmed(rep);
  const satisfied = confirmed;
  const capsAtYellow = confirmed && !live;

  const trace: TraceEntry[] = [
    {
      requirementId: req.proofRequirementId,
      satisfied: live,
      reason: live
        ? "Link resolved live — machine-checked reachability (content not verified)."
        : "No live link backs the confirmed page — no machine reachability.",
      machineOrHuman: "machine",
    },
    {
      requirementId: req.proofRequirementId,
      satisfied: confirmed,
      reason: confirmed
        ? "Operator confirmed the resolved page shows the Deliverable."
        : "No HumanConfirmation that the page shows the Deliverable.",
      machineOrHuman: "human",
    },
  ];
  return { satisfied, capsAtYellow, trace };
}

/** disclosure (AD-13, AC-2): a three-tier state. When a tier is pre-resolved use
 *  it (evidenced → Green-eligible / ambiguous → Yellow-cap / missing → unmet);
 *  otherwise fall back to operator-confirmed evidence. Disclosure evidence is a
 *  human screenshot review, so its sub-fact is always Human (AD-19). */
function evalDisclosure(req: SnapshotProofRequirement): RequirementEvaluation {
  const hasConfirmation = req.operatorEvidence.some((l) => l.humanConfirmations.length > 0);
  let satisfied: boolean;
  let capsAtYellow: boolean;
  let reason: string;

  switch (req.disclosureState) {
    case "evidenced":
      satisfied = true;
      capsAtYellow = false;
      reason = "Required disclosure visibly evidenced.";
      break;
    case "ambiguous":
    case "partial":
      satisfied = true;
      capsAtYellow = true;
      reason = "Required disclosure ambiguous/partial — a caveat is required.";
      break;
    case "missing":
      satisfied = false;
      capsAtYellow = false;
      reason = "Required disclosure missing.";
      break;
    default:
      // No pre-resolved tier yet (Epic 1): an operator-confirmed screenshot is
      // the evidence that the disclosure is visibly present.
      satisfied = hasConfirmation;
      capsAtYellow = false;
      reason = hasConfirmation
        ? "Disclosure evidenced by an operator-confirmed screenshot."
        : "No evidence the required disclosure is visible.";
  }

  return {
    satisfied,
    capsAtYellow,
    trace: [
      {
        requirementId: req.proofRequirementId,
        satisfied,
        reason,
        machineOrHuman: "human",
      },
    ],
  };
}

/** human-assertion (AD-19): a screenshot/metric/viewer figure — present but
 *  NEVER machine-verified. Present (an operator-affirmed link) = satisfied. A
 *  CRITICAL requirement met only by a human assertion caps at Yellow; a missing
 *  SUPPORTING one caps at Yellow (a missing critical one is Red via the table). */
function evalHumanAssertion(req: SnapshotProofRequirement): RequirementEvaluation {
  const present = req.operatorEvidence.length > 0;
  const isCritical = req.criticality === "critical";
  const satisfied = present;
  const capsAtYellow = isCritical ? present : !present;
  return {
    satisfied,
    capsAtYellow,
    trace: [
      {
        requirementId: req.proofRequirementId,
        satisfied,
        reason: present
          ? "Human-asserted figure present (operator-entered) — never machine-verified."
          : "No operator-affirmed evidence for this human-asserted requirement.",
        machineOrHuman: "human",
      },
    ],
  };
}

/** structured-field (AD-19): a machine-checkable present/absent field. Present =
 *  satisfied (machine-graded); a missing SUPPORTING field caps at Yellow. Not
 *  exercised by the seeded demo, but defined so the taxonomy is total. */
function evalStructuredField(req: SnapshotProofRequirement): RequirementEvaluation {
  const present = req.operatorEvidence.length > 0;
  const satisfied = present;
  const capsAtYellow = req.criticality === "supporting" && !present;
  return {
    satisfied,
    capsAtYellow,
    trace: [
      {
        requirementId: req.proofRequirementId,
        satisfied,
        reason: present
          ? "Structured field present — machine-checkable."
          : "Structured field absent.",
        machineOrHuman: "machine",
      },
    ],
  };
}
