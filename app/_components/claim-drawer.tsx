"use client";

// board.css carries the shared `.pd-stamp*` three-channel status vocabulary the
// drawer reuses for the pinned Proof Status / machine-verdict stamps.
import "./board.css";
import "./drawer.css";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ClaimCardEvidence, ClaimCardRequirement, ClaimCardView } from "@/src/services";
import { PROOF_STATUS_TOKENS, PROVENANCE_TOKENS } from "../_lib/design-tokens";
import { type Locale, localeStrings } from "../_lib/i18n";
import { proofStatusToDisplayKey } from "../_lib/proof-status";
import { useClaimDrawer } from "./claim-drawer-context";

// The Claim Card right-side drawer (Story 1.8, UX-DR13/DR14/DR10/DR24). It fills
// the Story-1.6 slot: on open it fetches the READ-ONLY claim-card view model
// (never runs the audit) and renders five hairline-divided sections — Proof
// Requirements · Evidence trail · Machine/Human facts · Caveat · Human override.
//
// It is a real dialog: role="dialog" aria-modal, aria-labelledby → the sticky
// <h2>, background inert, focus trapped, Esc / ✕ close with focus returning to
// the originating Board row, and step-to-next-claim without closing. Provenance
// (machine/human) is read from persisted data (AD-3) and rendered on a
// cool-slate/warm-taupe channel kept OFF the R/Y/G scale (NFR-D1). The Caveat
// well and Human override switch are interactive (Story 1.9): they POST to the
// override/caveat write seams and re-render from the refreshed view the route
// returns (single round-trip). The machine verdict stays pinned under an
// override, never hidden (AD-6); `authoredBy` is server-resolved, never trusted
// from the client.

type LoadState = "idle" | "loading" | "ready" | "error";

/** Selectors for the background regions inerted while the dialog is open
 *  (UX-DR24). The drawer + scrim are siblings of these, so they stay live. The
 *  standing-disclaimer footer (Story 1.10) is also a background sibling outside
 *  `.pd-workspace`, so it MUST be inerted too — otherwise browse-mode / SR users
 *  could reach it outside the `aria-modal` dialog, breaking modal isolation. */
const BACKGROUND_SELECTORS = [".pd-topbar", ".pd-rail", ".pd-main", ".pd-disclaimer"];

export function ClaimDrawer({ locale, agency }: { locale: Locale; agency: string }) {
  const { selectedClaimId, close, stepToNext, hasNext } = useClaimDrawer();
  const open = selectedClaimId !== null;
  const strings = localeStrings(locale);
  const titleId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<ClaimCardView | null>(null);
  const [state, setState] = useState<LoadState>("idle");

  // The currently-selected claim, tracked in a ref so the mutation-apply guard
  // below reads the LATEST value (not the one captured when a section rendered).
  const selectedClaimIdRef = useRef(selectedClaimId);
  selectedClaimIdRef.current = selectedClaimId;

  // Apply a mutation's refreshed card ONLY if the drawer is still on that claim.
  // An override/caveat request can resolve after the operator has stepped to the
  // next claim or closed the drawer; without this guard the in-flight response
  // would overwrite the current card with a stale one (mirrors the fetch path's
  // cancellation guard).
  const applyUpdated = useCallback((updated: ClaimCardView) => {
    if (updated.claimId !== selectedClaimIdRef.current) return;
    setView(updated);
  }, []);

  // Fetch the read-only card on open / claim change. The route is a pure read —
  // it never runs the audit (AD-6).
  useEffect(() => {
    if (selectedClaimId === null) {
      setView(null);
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("loading");
    fetch(`/api/claims/${encodeURIComponent(selectedClaimId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`claim fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: ClaimCardView) => {
        if (!cancelled) {
          setView(data);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setView(null);
          setState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClaimId]);

  // Background inert while open — the board stays visible behind the scrim but
  // never leaks keyboard/SR focus (UX-DR24). Drawer/scrim are siblings, so they
  // remain interactive.
  useEffect(() => {
    if (!open) return;
    const nodes = BACKGROUND_SELECTORS.flatMap((sel) =>
      Array.from(document.querySelectorAll<HTMLElement>(sel)),
    );
    for (const node of nodes) node.setAttribute("inert", "");
    return () => {
      for (const node of nodes) node.removeAttribute("inert");
    };
  }, [open]);

  // Esc closes (UX-DR24).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Move focus INTO the drawer as soon as it opens — never only after a
  // successful load. The background is set `inert` on open, so if focus stayed
  // outside during a slow or failed `/api/claims/...` load it would sit on
  // <body> (or never enter the dialog on error), breaking the modal contract
  // (UX-DR24). The heading is present immediately (empty until the card loads);
  // once the card is `ready` it carries the claim title, so re-focusing it then
  // announces the title — which also covers step-to-next (state cycles
  // loading→ready). Fallback to the close button if the heading is absent.
  useEffect(() => {
    if (!open) return;
    const root = drawerRef.current;
    if (!root) return;
    const focusInside = root.contains(document.activeElement);
    if (focusInside && state !== "ready") return;
    const target =
      root.querySelector<HTMLElement>("[data-drawer-heading]") ??
      root.querySelector<HTMLElement>(".pd-cc__close");
    target?.focus();
  }, [open, state]);

  // Trap Tab within the drawer while open (UX-DR24).
  useEffect(() => {
    if (!open) return;
    const node = drawerRef.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const onStepToNext = useCallback(() => stepToNext(), [stepToNext]);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="pd-scrim"
          aria-label={strings.drawer.closeAria}
          onClick={close}
          tabIndex={-1}
        />
      ) : null}
      <aside
        ref={drawerRef}
        className="pd-drawer"
        data-open={open}
        aria-hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {open ? (
          <DrawerContent
            titleId={titleId}
            state={state}
            view={view}
            locale={locale}
            agency={agency}
            claimId={selectedClaimId}
            hasNext={hasNext}
            onClose={close}
            onStepToNext={onStepToNext}
            onUpdated={applyUpdated}
          />
        ) : null}
      </aside>
    </>
  );
}

function DrawerContent({
  titleId,
  state,
  view,
  locale,
  agency,
  claimId,
  hasNext,
  onClose,
  onStepToNext,
  onUpdated,
}: {
  titleId: string;
  state: LoadState;
  view: ClaimCardView | null;
  locale: Locale;
  agency: string;
  claimId: string | null;
  hasNext: boolean;
  onClose: () => void;
  onStepToNext: () => void;
  onUpdated: (view: ClaimCardView) => void;
}) {
  const strings = localeStrings(locale);
  const d = strings.drawer;

  const statusKey =
    view?.effectiveStatus != null ? proofStatusToDisplayKey(view.effectiveStatus) : null;
  const statusToken = statusKey ? PROOF_STATUS_TOKENS[statusKey] : null;

  return (
    <div className="pd-cc">
      <header className="pd-cc__head">
        <div className="pd-cc__titlerow">
          {/* tabIndex -1 so focus can move here programmatically on open / step. */}
          <h2 id={titleId} data-drawer-heading tabIndex={-1} className="pd-cc__title">
            <span className="pd-cc__creator">{view?.creatorName ?? ""}</span>
            {view?.deliverableType ? (
              <span className="pd-cc__deliverable">{view.deliverableType}</span>
            ) : null}
          </h2>
          <button type="button" className="pd-cc__close" aria-label={d.closeAria} onClick={onClose}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        {statusToken ? (
          <span className={`pd-stamp pd-stamp--${statusToken.key}`}>
            <span className="pd-stamp__glyph" aria-hidden="true">
              {statusToken.glyph}
            </span>
            {locale === "fr" ? statusToken.labelFr : statusToken.labelEn}
          </span>
        ) : null}
      </header>

      {state === "loading" ? <p className="pd-cc__note">{d.loading}</p> : null}
      {state === "error" ? <p className="pd-cc__note pd-cc__note--error">{d.loadError}</p> : null}

      {state === "ready" && view ? (
        <div className="pd-cc__body">
          <RequirementsSection
            requirements={view.requirements}
            locale={locale}
            audited={view.effectiveStatus != null}
          />
          <EvidenceSection requirements={view.requirements} locale={locale} />
          <FactsSection view={view} locale={locale} />
          <CaveatSection view={view} locale={locale} claimId={claimId} onUpdated={onUpdated} />
          <OverrideSection
            view={view}
            locale={locale}
            agency={agency}
            claimId={claimId}
            onUpdated={onUpdated}
          />

          {hasNext ? (
            <div className="pd-cc__nav">
              <button type="button" className="pd-cc__next" onClick={onStepToNext}>
                {d.nextClaim}
                <span aria-hidden="true"> →</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Section 1 — Proof Requirements: criticality tag + ✓/○ satisfied state
 *  (never colour alone, UX-DR14). */
function RequirementsSection({
  requirements,
  locale,
  audited,
}: {
  requirements: ClaimCardRequirement[];
  locale: Locale;
  audited: boolean;
}) {
  const d = localeStrings(locale).drawer;
  return (
    <section className="pd-cc__section" aria-label={d.sections.requirements}>
      <h3 className="label-caps pd-cc__section-title">{d.sections.requirements}</h3>
      {!audited ? <p className="pd-cc__note">{d.pendingNote}</p> : null}
      <ul className="pd-cc__reqs">
        {requirements.map((req) => (
          <li key={req.proofRequirementId} className="pd-cc__req">
            <div className="pd-cc__req-head">
              <span className="pd-cc__req-name">{d.requirementKind[req.kind] ?? req.kind}</span>
              <span className={`pd-cc__crit pd-cc__crit--${req.criticality}`}>
                {req.criticality === "critical" ? d.criticality.critical : d.criticality.supporting}
              </span>
            </div>
            <RequirementState req={req} locale={locale} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RequirementState({ req, locale }: { req: ClaimCardRequirement; locale: Locale }) {
  const d = localeStrings(locale).drawer;
  if (req.satisfaction === "pending") return null;

  const satisfied = req.satisfaction === "satisfied";
  // The provenance the requirement is satisfied ON: for link-reachability it's
  // the human confirmation; otherwise the single sub-fact's provenance.
  const provenance =
    req.satisfactionType === "link-reachability"
      ? "human"
      : (req.traceEntries[0]?.machineOrHuman ?? "human");
  const label = satisfied ? d.satisfiedBy(provenance) : d.unsatisfied;

  return (
    <p className={`pd-cc__req-state pd-cc__req-state--${satisfied ? "yes" : "no"}`}>
      <span className="pd-cc__req-glyph" aria-hidden="true">
        {satisfied ? "✓" : "○"}
      </span>
      {label}
    </p>
  );
}

/** Section 2 — Evidence trail: each item carries a provenance chip (UX-DR10). */
function EvidenceSection({
  requirements,
  locale,
}: {
  requirements: ClaimCardRequirement[];
  locale: Locale;
}) {
  const d = localeStrings(locale).drawer;
  const items = requirements.flatMap((req) =>
    req.evidence.map((ev) => ({ ev, kind: req.kind, key: ev.evidenceLinkId })),
  );
  return (
    <section className="pd-cc__section" aria-label={d.sections.evidence}>
      <h3 className="label-caps pd-cc__section-title">{d.sections.evidence}</h3>
      {items.length === 0 ? (
        <p className="pd-cc__note">—</p>
      ) : (
        <ul className="pd-cc__evidence">
          {items.map(({ ev, key }) => (
            <EvidenceRow key={key} ev={ev} locale={locale} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EvidenceRow({ ev, locale }: { ev: ClaimCardEvidence; locale: Locale }) {
  const d = localeStrings(locale).drawer;
  const liveness = ev.livenessLabel ? d.liveness[ev.livenessLabel] : null;
  return (
    <li className="pd-cc__ev">
      <div className="pd-cc__ev-head">
        <ProvenanceChip provenance={ev.machineOrHuman} locale={locale} />
        <span className="pd-cc__ev-type">{d.evidenceType[ev.evidenceType] ?? ev.evidenceType}</span>
      </div>
      <p className="pd-cc__ev-meta">
        <span className="pd-cc__ev-uploaded">
          {d.uploadedLabel} <span className="pd-mono">{ev.uploadedAt}</span>
        </span>
        {liveness ? <span className="pd-cc__ev-liveness">{liveness}</span> : null}
      </p>
      {ev.confirmations.map((c) => (
        <p key={`${c.confirmedBy}-${c.confirmedAt}`} className="pd-cc__ev-confirm">
          {d.confirmedBy(c.confirmedBy, c.confirmedAt)}
        </p>
      ))}
    </li>
  );
}

/** The cool-slate / warm-taupe provenance chip, kept OFF the R/Y/G scale
 *  (AD-3 / NFR-D1). The glyph is decorative; the label carries the meaning. */
function ProvenanceChip({
  provenance,
  locale,
}: {
  provenance: "machine" | "human";
  locale: Locale;
}) {
  const d = localeStrings(locale).drawer;
  const token = PROVENANCE_TOKENS[provenance];
  const label = provenance === "machine" ? d.provenance.machine : d.provenance.human;
  return (
    <span className={`pd-prov pd-prov--${provenance}`}>
      <span className="pd-prov__glyph" aria-hidden="true">
        {token.glyph}
      </span>
      {label}
    </span>
  );
}

/** Section 3 — Machine/Human facts: the decomposed, persisted trace (AD-6). */
function FactsSection({ view, locale }: { view: ClaimCardView; locale: Locale }) {
  const d = localeStrings(locale).drawer;
  return (
    <section className="pd-cc__section" aria-label={d.sections.facts}>
      <h3 className="label-caps pd-cc__section-title">{d.sections.facts}</h3>
      {view.trace.length === 0 ? (
        <p className="pd-cc__note">{d.pendingNote}</p>
      ) : (
        <ul className="pd-cc__facts">
          {view.trace.map((t) => (
            <li key={`${t.requirementId}-${t.machineOrHuman}`} className="pd-cc__fact">
              <ProvenanceChip provenance={t.machineOrHuman} locale={locale} />
              <span
                className={`pd-cc__fact-mark pd-cc__fact-mark--${t.satisfied ? "yes" : "no"}`}
                aria-hidden="true"
              >
                {t.satisfied ? "✓" : "○"}
              </span>
              <span className="pd-cc__fact-reason">{t.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** POST/DELETE a Claim mutation; the route returns the refreshed Claim Card view
 *  (single round-trip). Resolves the updated view, or null on any failure so the
 *  caller can surface the error without swallowing it silently. */
async function mutateClaim(
  path: string,
  method: "POST" | "DELETE",
  body?: unknown,
): Promise<ClaimCardView | null> {
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return (await res.json()) as ClaimCardView;
  } catch {
    return null;
  }
}

/** Section 4 — Caveat well (Story 1.9, UX-DR16). Operator-authored narrative,
 *  serif-italic on a paper fill set apart by fill-shade + hairline (never a
 *  coloured side-tab). Editable here; read-only in the report. An effective-
 *  Yellow with no caveat shows the report-includability note (AD-6, AD-20/21). */
function CaveatSection({
  view,
  locale,
  claimId,
  onUpdated,
}: {
  view: ClaimCardView;
  locale: Locale;
  claimId: string | null;
  onUpdated: (view: ClaimCardView) => void;
}) {
  const d = localeStrings(locale).drawer;
  const [drafting, setDrafting] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus the field when the operator opens it (explicit intent, not page-load
  // autofocus) — the focus-trap keeps it inside the dialog.
  useEffect(() => {
    if (drafting) inputRef.current?.focus();
  }, [drafting]);

  async function submit() {
    const trimmed = text.trim();
    if (!claimId || trimmed.length === 0) return;
    setBusy(true);
    setError(false);
    const updated = await mutateClaim(`/api/claims/${encodeURIComponent(claimId)}/caveat`, "POST", {
      text: trimmed,
    });
    setBusy(false);
    if (!updated) {
      setError(true);
      return;
    }
    onUpdated(updated);
    setText("");
    setDrafting(false);
  }

  return (
    <section className="pd-cc__section" aria-label={d.sections.caveat}>
      <h3 className="label-caps pd-cc__section-title">{d.sections.caveat}</h3>

      {view.caveats.length === 0 ? (
        <div className="pd-cc__caveat pd-cc__caveat--empty">
          <span className="pd-cc__caveat-glyph" aria-hidden="true">
            ◐
          </span>
          {d.caveatEmpty}
        </div>
      ) : (
        <ul className="pd-cc__caveats">
          {view.caveats.map((c) => (
            <li key={c.caveatId} className="pd-cc__caveat">
              <span className="pd-cc__caveat-glyph" aria-hidden="true">
                ◐
              </span>
              <span className="pd-cc__caveat-body">
                <span className="pd-cc__caveat-text">{c.text}</span>
                <span className="pd-cc__caveat-attr pd-mono">{d.caveat.by(c.authoredBy)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {view.requiresCaveat ? (
        <p className="pd-cc__caveat-required">{d.caveat.requiresNote}</p>
      ) : null}

      {drafting ? (
        <div className="pd-cc__caveat-form">
          <textarea
            ref={inputRef}
            className="pd-cc__caveat-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={d.caveat.placeholder}
            rows={3}
            aria-label={d.sections.caveat}
          />
          <div className="pd-cc__caveat-actions">
            <button
              type="button"
              className="pd-cc__btn pd-cc__btn--primary"
              onClick={submit}
              disabled={busy || text.trim().length === 0}
            >
              {d.caveat.save}
            </button>
            <button
              type="button"
              className="pd-cc__btn"
              onClick={() => {
                setDrafting(false);
                setText("");
                setError(false);
              }}
              disabled={busy}
            >
              {d.caveat.cancel}
            </button>
          </div>
          {error ? <p className="pd-cc__note pd-cc__note--error">{d.mutationError}</p> : null}
        </div>
      ) : (
        <button
          type="button"
          className="pd-cc__btn pd-cc__caveat-add"
          onClick={() => setDrafting(true)}
        >
          <span aria-hidden="true">+ </span>
          {d.caveat.add}
        </button>
      )}
    </section>
  );
}

/** Section 5 — Human override (Story 1.9, FR-10, UX-DR17). The machine verdict
 *  stays pinned above and is NEVER hidden (AD-6). The switch is a real
 *  role="switch" with an ever-present on/off WORD (never colour/knob-position
 *  alone); turning it on reveals the three Proof Status options; the change is
 *  stamped "by [operator] · [agency]" in mono. Provenance stays on the human
 *  channel, off the R/Y/G scale (AD-3). */
function OverrideSection({
  view,
  locale,
  agency,
  claimId,
  onUpdated,
}: {
  view: ClaimCardView;
  locale: Locale;
  agency: string;
  claimId: string | null;
  onUpdated: (view: ClaimCardView) => void;
}) {
  const d = localeStrings(locale).drawer;
  const attrId = useId();
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const machineKey =
    view.machineVerdict != null ? proofStatusToDisplayKey(view.machineVerdict) : null;
  const machineToken = machineKey ? PROOF_STATUS_TOKENS[machineKey] : null;

  // Pre-audit there is no machine verdict to pin — the override has nothing to
  // sit over, so the control stays inert (never fabricates a verdict, AD-6).
  const audited = view.machineVerdict != null;
  const isOn = view.overrideStatus != null;
  const showPicker = audited && (isOn || arming);

  const statusLabelOf = (s: "green" | "yellow" | "red") =>
    s === "green"
      ? d.override.statusLabel.green
      : s === "yellow"
        ? d.override.statusLabel.yellow
        : d.override.statusLabel.red;

  async function run(promise: Promise<ClaimCardView | null>) {
    setBusy(true);
    setError(false);
    const updated = await promise;
    setBusy(false);
    if (!updated) {
      setError(true);
      return;
    }
    onUpdated(updated);
  }

  function onToggle() {
    if (!claimId || !audited) return;
    if (isOn) {
      // Turn OFF → clear the override; effective status returns to the machine
      // verdict.
      setArming(false);
      void run(mutateClaim(`/api/claims/${encodeURIComponent(claimId)}/override`, "DELETE"));
    } else {
      // Turn ON → reveal the status picker; nothing is written until the
      // operator chooses a status (an override must carry a final status).
      setArming((a) => !a);
      setError(false);
    }
  }

  function choose(finalStatus: "green" | "yellow" | "red") {
    if (!claimId) return;
    void run(
      mutateClaim(`/api/claims/${encodeURIComponent(claimId)}/override`, "POST", { finalStatus }),
    ).then(() => setArming(false));
  }

  return (
    <section className="pd-cc__section" aria-label={d.sections.override}>
      <h3 className="label-caps pd-cc__section-title">{d.sections.override}</h3>

      {machineToken ? (
        <p className="pd-cc__machine">
          <span className="pd-cc__machine-label">{d.machineVerdictLabel}</span>
          <span className={`pd-stamp pd-stamp--${machineToken.key}`}>
            <span className="pd-stamp__glyph" aria-hidden="true">
              {machineToken.glyph}
            </span>
            {locale === "fr" ? machineToken.labelFr : machineToken.labelEn}
          </span>
        </p>
      ) : null}

      {!audited ? (
        <p className="pd-cc__note">{d.pendingNote}</p>
      ) : (
        <>
          <div className="pd-cc__override-control">
            <button
              type="button"
              role="switch"
              aria-checked={isOn || arming}
              aria-label={d.override.switchLabel}
              aria-describedby={isOn ? attrId : undefined}
              className="pd-cc__switch"
              onClick={onToggle}
              disabled={busy}
            >
              <span className="pd-cc__switch-track" aria-hidden="true">
                <span className="pd-cc__switch-thumb" />
              </span>
            </button>
            <span className="pd-cc__switch-label">
              {d.override.switchLabel}
              {/* Ever-present WORD — the colour-independent on/off cue (UX-DR17). */}
              <span className="pd-cc__switch-state">
                {isOn || arming ? d.override.on : d.override.off}
              </span>
            </span>
          </div>

          {showPicker ? (
            <fieldset className="pd-cc__override-picker">
              <legend className="pd-cc__override-prompt">{d.override.setPrompt}</legend>
              {(["green", "yellow", "red"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="pd-cc__btn pd-cc__override-option"
                  aria-pressed={view.overrideStatus === s}
                  onClick={() => choose(s)}
                  disabled={busy}
                >
                  {statusLabelOf(s)}
                </button>
              ))}
            </fieldset>
          ) : null}

          {isOn && view.overrideAuthoredBy ? (
            <p id={attrId} className="pd-cc__override-attr pd-mono">
              {d.override.by(view.overrideAuthoredBy, agency)}
            </p>
          ) : (
            <p className="pd-cc__note">{d.overrideEmpty}</p>
          )}

          {error ? <p className="pd-cc__note pd-cc__note--error">{d.mutationError}</p> : null}
        </>
      )}
    </section>
  );
}
