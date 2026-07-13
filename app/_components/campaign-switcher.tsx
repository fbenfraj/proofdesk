"use client";

import "./campaign-switcher.css";
import { useState } from "react";
import type { CampaignSummary } from "@/src/services";
import { CAMPAIGN_COOKIE, CAMPAIGN_COOKIE_MAX_AGE } from "../_lib/campaign-cookie";
import { type Locale, localeStrings } from "../_lib/i18n";

// The real campaign switcher (Story AI-12) - replaces the placeholder chrome. It
// NAMES scenarios and lets a presenter switch or start a new one live; it never
// shows a proof verdict (no green/yellow/red word or colour). The single proof
// signal stays on the Board + report, never in the nav chrome - the same wall the
// AI-10 stage strip honours. Writes the pd_campaign cookie (mirroring LangToggle)
// and refreshes so every server surface re-reads the active scenario.
export function CampaignSwitcher({
  locale,
  activeCampaignId,
  activeCampaignName,
  campaigns,
}: {
  locale: Locale;
  activeCampaignId: string;
  activeCampaignName: string;
  campaigns: CampaignSummary[];
}) {
  const s = localeStrings(locale).scenario;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function writeCookie(id: string) {
    // biome-ignore lint/suspicious/noDocumentCookie: document.cookie is the widely-supported write path (mirrors LangToggle).
    document.cookie = `${CAMPAIGN_COOKIE}=${id};path=/;max-age=${CAMPAIGN_COOKIE_MAX_AGE};samesite=lax`;
  }

  function setActive(id: string) {
    if (id === activeCampaignId) {
      setOpen(false);
      return;
    }
    writeCookie(id);
    setOpen(false);
    // A hard reload of the current surface, not router.refresh(): the board and
    // other client surfaces hold per-scenario state (e.g. the cockpit's resolved
    // audit rows) that a soft refresh would NOT reset, bleeding the previous
    // scenario's verdicts onto the newly selected one. Reloading guarantees each
    // scenario renders only its own state.
    window.location.reload();
  }

  async function startNew() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const { id } = (await res.json()) as { id: string };
      writeCookie(id);
      setOpen(false);
      // Land on the Board (stage 3) to build the new scenario up from empty. A
      // hard navigation (not router.refresh) guarantees the server re-renders the
      // Board against the new scenario cookie with no stale client data lingering
      // from the previous scenario - a clean slate, which is exactly what starting
      // a scenario in front of a client should show.
      window.location.assign("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pd-switcher-wrap">
      <button
        type="button"
        className="pd-switcher"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={s.switchAria}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="label-caps pd-switcher__cap">{s.label}</span>
        <span className="pd-switcher__name">{activeCampaignName || s.label}</span>
        <span className="pd-switcher__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="pd-switcher__menu" role="menu">
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitem"
              className="pd-switcher__item"
              aria-current={c.id === activeCampaignId ? "true" : undefined}
              onClick={() => setActive(c.id)}
            >
              <span className="pd-switcher__item-name">{c.name}</span>
              {c.id === activeCampaignId ? (
                <span className="pd-switcher__item-tag">{s.activeSuffix}</span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className="pd-switcher__item pd-switcher__item--new"
            onClick={startNew}
            disabled={busy}
          >
            + {s.startNew}
          </button>
        </div>
      ) : null}
    </div>
  );
}
