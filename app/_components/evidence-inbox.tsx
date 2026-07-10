"use client";

import "./evidence-inbox.css";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { INTAKE_KIND, type IntakeKind } from "@/src/schema/enums";
import type { DeliverableOption, InboxItemView, MatchState } from "@/src/services";
import { type Locale, localeStrings } from "../_lib/i18n";
import { ProvenanceChip } from "./provenance-chip";

// The Evidence Inbox surface (Story 2.1 ingest + Story 2.2 matching). Single
// intake surface for the four kinds; on add it POSTs multipart/form-data to
// /api/evidence and prepends the returned view — which now carries the item's
// deterministic match state (a suggested Deliverable, or Unassigned).
//
// Matching honesty (FR-6, AD-17, UX-DR19): a suggestion is a MACHINE act shown
// with NO confidence score, NO ranking, NO "most likely". The operator Confirms
// (affirms the suggested Deliverable) or Reassigns (picks another) — writing an
// operator EvidenceLink, the only kind that enters the audit. Decision buttons
// are quiet outline (the spine supersedes the mock's filled fills). Actions are
// immediate — no confirmation dialog — and reversible via Undo (NFR-D7).

const ACCEPT_IMAGE = "image/png,image/jpeg,image/webp";

/** A transient undo affordance after an affirmation (NFR-D7). */
interface Toast {
  itemId: string;
  message: string;
}

export function EvidenceInbox({
  locale,
  campaignId,
  initialItems,
  deliverables,
}: {
  locale: Locale;
  campaignId: string;
  initialItems: InboxItemView[];
  deliverables: DeliverableOption[];
}) {
  const s = localeStrings(locale);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<InboxItemView[]>(initialItems);
  const [kind, setKind] = useState<IntakeKind>("url");
  const [type, setType] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [clientCaptured, setClientCaptured] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const isFileKind = kind === "image" || kind === "metric";

  function resetForm() {
    setType("");
    setUrl("");
    setNote("");
    setClientCaptured("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function setItemMatch(itemId: string, match: MatchState) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, match } : it)));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("campaignId", campaignId);
      fd.set("intakeKind", kind);
      fd.set("type", type);
      if (kind === "url") fd.set("url", url);
      if (kind === "text") fd.set("note", note);
      if (isFileKind && fileRef.current?.files?.[0]) fd.set("file", fileRef.current.files[0]);
      if (clientCaptured) {
        // datetime-local (local, no tz) → UTC ISO-8601 for the server boundary.
        fd.set("clientCapturedAt", new Date(clientCaptured).toISOString());
      }

      const res = await fetch("/api/evidence", { method: "POST", body: fd });
      if (!res.ok) {
        setError(s.inbox.error);
        return;
      }
      const view = (await res.json()) as InboxItemView;
      setItems((prev) => [view, ...prev]);
      resetForm();
      // Refresh the server-rendered rail-badge count.
      router.refresh();
    } catch {
      setError(s.inbox.error);
    } finally {
      setSubmitting(false);
    }
  }

  /** Affirm/reassign: POST an operator link; update the card + offer Undo. */
  async function assign(itemId: string, deliverableId: string, message: string) {
    setError(null);
    try {
      const res = await fetch(`/api/evidence/${itemId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliverableId }),
      });
      if (!res.ok) {
        setError(s.inbox.error);
        return;
      }
      const { match } = (await res.json()) as { match: MatchState };
      setItemMatch(itemId, match);
      setToast({ itemId, message });
      router.refresh();
    } catch {
      setError(s.inbox.error);
    }
  }

  /** Undo an assignment: drop the operator link, restore the suggestion. */
  async function unassign(itemId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/evidence/${itemId}/unassign`, { method: "POST" });
      if (!res.ok) {
        setError(s.inbox.error);
        return;
      }
      const { match } = (await res.json()) as { match: MatchState };
      setItemMatch(itemId, match);
      setToast(null);
      router.refresh();
    } catch {
      setError(s.inbox.error);
    }
  }

  return (
    <section className="pd-inbox">
      <h1 className="pd-page-title">{s.inbox.title}</h1>
      <p className="pd-lead">{s.inbox.lead}</p>

      <form className="pd-inbox__add" onSubmit={onSubmit}>
        <fieldset className="pd-inbox__kinds">
          <legend className="label-caps pd-inbox__legend">{s.inbox.addHeading}</legend>
          {INTAKE_KIND.map((k) => (
            <label key={k} className="pd-inbox__kind">
              <input
                type="radio"
                name="intakeKind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              <span>{s.inbox.intakeKind[k]}</span>
            </label>
          ))}
        </fieldset>

        {kind === "url" ? (
          <label className="pd-inbox__field">
            <span className="label-caps">{s.inbox.urlLabel}</span>
            <input
              className="pd-inbox__input pd-inbox__input--mono"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={s.inbox.urlPlaceholder}
              required
            />
          </label>
        ) : null}

        {kind === "text" ? (
          <label className="pd-inbox__field">
            <span className="label-caps">{s.inbox.noteLabel}</span>
            <textarea
              className="pd-inbox__input pd-inbox__textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={s.inbox.notePlaceholder}
              rows={3}
              required
            />
          </label>
        ) : null}

        {isFileKind ? (
          <label className="pd-inbox__field">
            <span className="label-caps">{s.inbox.fileLabel}</span>
            <input
              ref={fileRef}
              className="pd-inbox__input"
              type="file"
              name="file"
              accept={ACCEPT_IMAGE}
              required
            />
          </label>
        ) : null}

        <label className="pd-inbox__field">
          <span className="label-caps">{s.inbox.typeLabel}</span>
          <input
            className="pd-inbox__input"
            type="text"
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder={s.inbox.typePlaceholder}
            maxLength={200}
            required
          />
        </label>

        <label className="pd-inbox__field">
          <span className="label-caps">{s.inbox.clientCapturedLabel}</span>
          <input
            className="pd-inbox__input"
            type="datetime-local"
            value={clientCaptured}
            onChange={(e) => setClientCaptured(e.target.value)}
          />
        </label>

        <div className="pd-inbox__actions">
          <button type="submit" className="pd-btn-outline" disabled={submitting}>
            {submitting ? s.inbox.submitting : s.inbox.submit}
          </button>
        </div>
        {error ? (
          <p className="pd-inbox__error" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      <p className="pd-inbox__helper">{s.inbox.match.helper}</p>

      <h2 className="label-caps pd-inbox__list-heading">{s.inbox.listHeading}</h2>
      {items.length === 0 ? (
        <p className="pd-inbox__empty">{s.inbox.empty}</p>
      ) : (
        <ul className="pd-inbox__list">
          {items.map((item) => (
            <EvidenceCard
              key={item.id}
              item={item}
              deliverables={deliverables}
              locale={locale}
              onConfirm={(deliverableId) =>
                assign(item.id, deliverableId, s.inbox.match.toastConfirmed)
              }
              onReassign={(deliverableId) =>
                assign(item.id, deliverableId, s.inbox.match.toastReassigned)
              }
              onUndo={() => unassign(item.id)}
            />
          ))}
        </ul>
      )}

      {toast ? (
        <div className="pd-inbox__toast" role="status">
          <span>{toast.message}</span>
          <button
            type="button"
            className="pd-inbox__toast-undo"
            onClick={() => unassign(toast.itemId)}
          >
            {s.inbox.match.undo}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function EvidenceCard({
  item,
  deliverables,
  locale,
  onConfirm,
  onReassign,
  onUndo,
}: {
  item: InboxItemView;
  deliverables: DeliverableOption[];
  locale: Locale;
  onConfirm: (deliverableId: string) => void;
  onReassign: (deliverableId: string) => void;
  onUndo: () => void;
}) {
  const s = localeStrings(locale);
  return (
    <li className="pd-ev">
      <div className="pd-ev__head">
        <span className="label-caps pd-ev__kind">{item.type}</span>
        <time className="pd-ev__time" dateTime={item.uploadedAt}>
          {item.uploadedAt}
        </time>
      </div>

      <div className="pd-ev__body">
        {item.url ? (
          <a className="pd-ev__link" href={item.url} target="_blank" rel="noreferrer noopener">
            {item.url}
          </a>
        ) : null}
        {item.note ? <p className="pd-ev__note">{item.note}</p> : null}
        {item.storageKey ? (
          <p className="pd-ev__file">{item.originalFilename ?? item.contentType}</p>
        ) : null}
      </div>

      <MatchBlock
        match={item.match}
        seeded={item.dataOrigin === "seeded"}
        deliverables={deliverables}
        locale={locale}
        onConfirm={onConfirm}
        onReassign={onReassign}
        onUndo={onUndo}
      />

      <div className="pd-ev__foot">
        <ProvenanceChip provenance={item.machineOrHuman} locale={locale} />
        {item.clientCapturedAt ? (
          <span className="pd-ev__captured">
            {s.inbox.capturedClientLabel}{" "}
            <span className="pd-ev__time">{item.clientCapturedAt}</span>
          </span>
        ) : null}
      </div>
    </li>
  );
}

/** The deterministic-match block (UX-DR19). Three states: suggested (Confirm /
 *  Reassign), unassigned (Assign-to-Deliverable), assigned (Reassign / Undo). No
 *  confidence, no ranking anywhere — a suggestion shows only the one rule-matched
 *  Deliverable and the rule that fired (inspectable). */
function MatchBlock({
  match,
  seeded,
  deliverables,
  locale,
  onConfirm,
  onReassign,
  onUndo,
}: {
  match: MatchState;
  seeded: boolean;
  deliverables: DeliverableOption[];
  locale: Locale;
  onConfirm: (deliverableId: string) => void;
  onReassign: (deliverableId: string) => void;
  onUndo: () => void;
}) {
  const m = localeStrings(locale).inbox.match;

  if (match.status === "suggested") {
    const { suggestion } = match;
    return (
      <div className="pd-match">
        <span className="label-caps pd-match__cap">
          {m.suggestedHeading} · {m.byRule}
          {seeded ? <span className="pd-match__seeded">{m.seeded}</span> : null}
        </span>
        <span className="pd-match__target">
          {m.deliverable(suggestion.creatorName, suggestion.deliverableType)}
        </span>
        {suggestion.rule ? <span className="pd-match__rule">{suggestion.rule}</span> : null}
        <div className="pd-match__controls">
          <button
            type="button"
            className="pd-btn-outline pd-match__confirm"
            onClick={() => onConfirm(suggestion.deliverableId)}
          >
            {m.confirm}
          </button>
          <DeliverablePicker
            label={m.reassign}
            deliverables={deliverables}
            onPick={onReassign}
            locale={locale}
          />
        </div>
      </div>
    );
  }

  if (match.status === "assigned") {
    const { assignment } = match;
    return (
      <div className="pd-match pd-match--assigned">
        <span className="label-caps pd-match__cap">{m.assignedHeading}</span>
        <span className="pd-match__target">
          {m.deliverable(assignment.creatorName, assignment.deliverableType)}
        </span>
        <div className="pd-match__controls">
          <DeliverablePicker
            label={m.reassign}
            deliverables={deliverables}
            onPick={onReassign}
            locale={locale}
          />
          <button type="button" className="pd-btn-outline" onClick={onUndo}>
            {m.undo}
          </button>
        </div>
      </div>
    );
  }

  // Unassigned — no guess is forced.
  return (
    <div className="pd-match pd-match--unassigned">
      <span className="label-caps pd-match__cap">{m.noMatchHeading}</span>
      <span className="pd-match__stamp">{m.unassigned}</span>
      <p className="pd-match__reason">{m.unassignedReason}</p>
      <div className="pd-match__controls">
        <DeliverablePicker
          label={m.assign}
          deliverables={deliverables}
          onPick={onReassign}
          locale={locale}
        />
      </div>
    </div>
  );
}

/** A native <select> Deliverable picker (grouped by Creator) — accessible, no
 *  modal. Picking one acts immediately (no confirm dialog, NFR-D7). */
function DeliverablePicker({
  label,
  deliverables,
  onPick,
  locale,
}: {
  label: string;
  deliverables: DeliverableOption[];
  onPick: (deliverableId: string) => void;
  locale: Locale;
}) {
  const m = localeStrings(locale).inbox.match;
  // Group options by Creator for the picker.
  const byCreator = new Map<string, DeliverableOption[]>();
  for (const d of deliverables) {
    const list = byCreator.get(d.creatorName) ?? [];
    list.push(d);
    byCreator.set(d.creatorName, list);
  }
  return (
    <label className="pd-match__picker">
      <span className="label-caps pd-match__picker-label">{label}</span>
      <select
        className="pd-match__select"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value);
          e.target.value = "";
        }}
      >
        <option value="" disabled>
          {m.choose}
        </option>
        {[...byCreator.entries()].map(([creator, list]) => (
          <optgroup key={creator} label={creator}>
            {list.map((d) => (
              <option key={d.deliverableId} value={d.deliverableId}>
                {d.deliverableType}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
