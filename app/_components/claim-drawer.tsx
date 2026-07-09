"use client";

import { useCallback, useEffect, useState } from "react";

// Right-side Claim Card drawer SLOT (UX-DR7). For Story 1.2 this is an empty,
// open/close-able 498px container + scrim only — it slides over the canvas
// without hiding it. The board-row trigger that opens it, the Claim Card
// contents, and the full dialog a11y (focus trap / inert / labelledby,
// UX-DR24) all arrive with Story 1.8. Closed by default.
export function ClaimDrawer() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="pd-scrim"
          aria-label="Close"
          onClick={close}
          tabIndex={-1}
        />
      ) : null}
      <aside className="pd-drawer" data-open={open} aria-hidden={!open}>
        {/* Empty slot — Claim Card contents arrive in Story 1.8. */}
      </aside>
    </>
  );
}
