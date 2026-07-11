"use client";

import "./capture-form.css";
import { useRef, useState } from "react";
import { type Locale, localeStrings } from "../_lib/i18n";

// The mobile capture-only surface (Story 2.5, UX-DR8, NFR-D8, FR-5). A stripped
// three-action intake — paste link / upload screenshot / paste note — for a
// community manager away from the desk. It is deliberately NON-responsive: it
// lives in the standalone `(capture)` route group with no desktop shell, so no
// Board, Claim Card, Proof Brief, or Report is ever served here.
//
// AC2 (no mobile-only code path): submit POSTs the exact same multipart/form-data
// contract to the ONE shared ingest route `/api/evidence` that the desktop Inbox
// uses (app/_components/evidence-inbox.tsx). Provenance, server-UTC `uploaded_at`,
// `data_origin`, and deterministic matching are all derived server-side by that
// pipeline — the client NEVER sends `machine_or_human`, `uploaded_at`, or
// `data_origin` (AD-3/AD-11/AD-9). There is no capture-specific endpoint.

const ACCEPT_IMAGE = "image/png,image/jpeg,image/webp";

/** The three mobile capture actions — a strict subset of the desktop intake
 *  kinds. The fourth desktop kind (a dedicated metric-screenshot intake) is not
 *  offered on mobile; a metric screenshot is still captured here as a screenshot. */
const CAPTURE_KINDS = ["url", "image", "text"] as const;
type CaptureKind = (typeof CAPTURE_KINDS)[number];

export function CaptureForm({ locale, campaignId }: { locale: Locale; campaignId: string }) {
  const s = localeStrings(locale).capture;
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<CaptureKind>("url");
  const [type, setType] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFileKind = kind === "image";

  function pickKind(next: CaptureKind) {
    setKind(next);
    setError(null);
    setCaptured(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCaptured(false);
    setSubmitting(true);
    try {
      // The identical FormData contract the desktop Inbox posts — same fields,
      // same endpoint, same server-owned derivation. No mobile-only branch.
      const fd = new FormData();
      fd.set("campaignId", campaignId);
      fd.set("intakeKind", kind);
      fd.set("type", type);
      if (kind === "url") fd.set("url", url);
      if (kind === "text") fd.set("note", note);
      if (isFileKind && fileRef.current?.files?.[0]) fd.set("file", fileRef.current.files[0]);

      const res = await fetch("/api/evidence", { method: "POST", body: fd });
      if (!res.ok) {
        setError(s.error);
        return;
      }
      setType("");
      setUrl("");
      setNote("");
      if (fileRef.current) fileRef.current.value = "";
      setCaptured(true);
    } catch {
      setError(s.error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="pd-capture">
      <h1 className="pd-capture__title">{s.title}</h1>
      <p className="pd-capture__lead">{s.lead}</p>

      <form className="pd-capture__form" onSubmit={onSubmit}>
        <fieldset className="pd-capture__kinds">
          <legend className="label-caps pd-capture__legend">{s.title}</legend>
          {CAPTURE_KINDS.map((k) => (
            <label key={k} className="pd-capture__kind">
              <input
                type="radio"
                name="captureKind"
                value={k}
                checked={kind === k}
                onChange={() => pickKind(k)}
              />
              <span>{s.action[k]}</span>
            </label>
          ))}
        </fieldset>

        {kind === "url" ? (
          <label className="pd-capture__field">
            <span className="label-caps">{s.urlLabel}</span>
            <input
              className="pd-capture__input pd-capture__input--mono"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={s.urlPlaceholder}
              required
            />
          </label>
        ) : null}

        {kind === "text" ? (
          <label className="pd-capture__field">
            <span className="label-caps">{s.noteLabel}</span>
            <textarea
              className="pd-capture__input pd-capture__textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={s.notePlaceholder}
              rows={4}
              required
            />
          </label>
        ) : null}

        {isFileKind ? (
          <label className="pd-capture__field">
            <span className="label-caps">{s.fileLabel}</span>
            <input
              ref={fileRef}
              className="pd-capture__input"
              type="file"
              name="file"
              accept={ACCEPT_IMAGE}
              required
            />
          </label>
        ) : null}

        <label className="pd-capture__field">
          <span className="label-caps">{s.typeLabel}</span>
          <input
            className="pd-capture__input"
            type="text"
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder={s.typePlaceholder}
            maxLength={200}
            required
          />
        </label>

        <button type="submit" className="pd-btn-outline pd-capture__submit" disabled={submitting}>
          {submitting ? s.submitting : s.submit}
        </button>

        {captured ? (
          <p className="pd-capture__success" role="status">
            {s.success}
          </p>
        ) : null}
        {error ? (
          <p className="pd-capture__error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
