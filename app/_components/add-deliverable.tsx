"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Locale, localeStrings } from "../_lib/i18n";

// Board "add an item" affordance (Story AI-12). Adds one deliverable + its 1:1
// Claim to the ACTIVE scenario live, so a presenter can build the ledger up in
// front of a client. The new row reads `pending` until the audit runs - we never
// fabricate a starting verdict (AD-4/AD-6). Every added deliverable IS a claim of
// delivery (Claim is 1:1 with Deliverable), so `claimedStatus` is set to
// "delivered" server-side; there is no "claimed?" toggle to mislead.
export function AddDeliverable({
  locale,
  campaignId,
  creators,
}: {
  locale: Locale;
  campaignId: string;
  creators: { id: string; name: string }[];
}) {
  const s = localeStrings(locale).addDeliverable;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [creatorId, setCreatorId] = useState(creators[0]?.id ?? "");
  const [creatorName, setCreatorName] = useState("");
  const [handle, setHandle] = useState("");
  const [type, setType] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // With no existing creators (e.g. a brand-new empty scenario) the only path is
  // to create a new creator, so force "new" regardless of the retained choice.
  // This keeps the form usable when the active scenario switches from a populated
  // board to an empty one without remounting the component.
  const activeMode = creators.length === 0 ? "new" : mode;

  function reset() {
    setType("");
    setCreatorName("");
    setHandle("");
    setUrl("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const creator =
        activeMode === "existing"
          ? { id: creatorId }
          : { name: creatorName, handle: handle.trim() || undefined };
      const res = await fetch(`/api/campaigns/${campaignId}/deliverables`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creator, type, platformUrl: url.trim() || undefined }),
      });
      if (!res.ok) {
        setError(s.error);
        return;
      }
      reset();
      setOpen(false);
      // Reconcile the server-rendered board so the new row appears under its
      // creator group (AI-11), reading pending until the audit runs.
      router.refresh();
    } catch {
      setError(s.error);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="pd-btn-outline pd-add-deliverable__open"
        onClick={() => setOpen(true)}
      >
        + {s.open}
      </button>
    );
  }

  return (
    <form className="pd-add-deliverable" onSubmit={onSubmit}>
      <p className="label-caps pd-add-deliverable__heading">{s.heading}</p>

      <fieldset className="pd-add-deliverable__creator">
        <legend className="label-caps">{s.creatorLegend}</legend>
        {creators.length ? (
          <label className="pd-add-deliverable__radio">
            <input
              type="radio"
              name="creatorMode"
              checked={activeMode === "existing"}
              onChange={() => setMode("existing")}
            />
            <span>{s.existingCreator}</span>
            <select
              value={creatorId}
              onChange={(e) => setCreatorId(e.target.value)}
              disabled={activeMode !== "existing"}
              aria-label={s.existingCreator}
            >
              {creators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="pd-add-deliverable__radio">
          <label>
            <input
              type="radio"
              name="creatorMode"
              checked={activeMode === "new"}
              onChange={() => setMode("new")}
            />
            <span>{s.newCreator}</span>
          </label>
          <input
            type="text"
            aria-label={s.creatorNameLabel}
            placeholder={s.creatorNameLabel}
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            disabled={activeMode !== "new"}
            required={activeMode === "new"}
            maxLength={120}
          />
          <input
            type="text"
            aria-label={s.handleLabel}
            placeholder={s.handleLabel}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            disabled={activeMode !== "new"}
            maxLength={120}
          />
        </div>
      </fieldset>

      <label className="pd-add-deliverable__field">
        <span className="label-caps">{s.typeLabel}</span>
        <input
          type="text"
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder={s.typePlaceholder}
          maxLength={200}
          required
        />
      </label>

      <label className="pd-add-deliverable__field">
        <span className="label-caps">{s.urlLabel}</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={s.urlPlaceholder}
        />
      </label>

      <div className="pd-add-deliverable__actions">
        <button type="submit" className="pd-btn-outline" disabled={busy}>
          {busy ? s.submitting : s.submit}
        </button>
        <button
          type="button"
          className="pd-btn-outline"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          {s.cancel}
        </button>
      </div>
      {error ? (
        <p role="alert" className="pd-add-deliverable__error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
