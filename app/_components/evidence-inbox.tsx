"use client";

import "./evidence-inbox.css";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { INTAKE_KIND, type IntakeKind } from "@/src/schema/enums";
import type { EvidenceItemView } from "@/src/services";
import { type Locale, localeStrings } from "../_lib/i18n";
import { ProvenanceChip } from "./provenance-chip";

// The Evidence Inbox surface (Story 2.1, FR-5, UX Evidence-Inbox intake). Single
// intake surface for the four kinds; on add it POSTs multipart/form-data to
// /api/evidence and prepends the returned view. Decision/submit buttons are quiet
// outline + focus ring (the inbox mock's filled fills are superseded by the
// spine). No confidence, no ranking, no "smart" affordance — matching lands in
// Story 2.2. Provenance is shown via the shared cool/warm chip, off the R/Y/G
// scale. `router.refresh()` re-reads the server rail-badge count after an add.

const ACCEPT_IMAGE = "image/png,image/jpeg,image/webp";

export function EvidenceInbox({
  locale,
  campaignId,
  initialItems,
}: {
  locale: Locale;
  campaignId: string;
  initialItems: EvidenceItemView[];
}) {
  const s = localeStrings(locale);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<EvidenceItemView[]>(initialItems);
  const [kind, setKind] = useState<IntakeKind>("url");
  const [type, setType] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [clientCaptured, setClientCaptured] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFileKind = kind === "image" || kind === "metric";

  function resetForm() {
    setType("");
    setUrl("");
    setNote("");
    setClientCaptured("");
    if (fileRef.current) fileRef.current.value = "";
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
      const view = (await res.json()) as EvidenceItemView;
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

      <h2 className="label-caps pd-inbox__list-heading">{s.inbox.listHeading}</h2>
      {items.length === 0 ? (
        <p className="pd-inbox__empty">{s.inbox.empty}</p>
      ) : (
        <ul className="pd-inbox__list">
          {items.map((item) => (
            <EvidenceCard key={item.id} item={item} locale={locale} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EvidenceCard({ item, locale }: { item: EvidenceItemView; locale: Locale }) {
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
