"use client";

import "./board.css";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect } from "react";
import type { BoardRowStatus, BoardRowView } from "@/src/services";
import { PENDING_TOKEN, PROOF_STATUS_TOKENS } from "../_lib/design-tokens";
import { type Locale, localeStrings } from "../_lib/i18n";
import { proofStatusToDisplayKey } from "../_lib/proof-status";
import { useClaimDrawer } from "./claim-drawer-context";

// The claimed-vs-proven ledger (Story 1.6). One row per Deliverable: mono index,
// serif Creator, muted type, a neutral claimed marker, and the three-channel
// Proof Status stamp. Rows are keyboard-operable (Enter/Space) and open the
// Claim Card drawer (its contents arrive in Story 1.8); the selected row carries
// the surface-raised fill + oxblood inset edge (UX-DR12/DR27).
export function ProofBoard({ rows, locale }: { rows: BoardRowView[]; locale: Locale }) {
  const strings = localeStrings(locale);
  const { selectedClaimId, openClaim, registerOrder } = useClaimDrawer();

  // Register the row order so the drawer's step-to-next knows the sequence
  // (UX-DR24). An effect (not render) so it never sets state during render.
  useEffect(() => {
    registerOrder(rows.map((r) => r.claimId));
  }, [rows, registerOrder]);

  if (rows.length === 0) {
    return <div className="pd-board pd-board__empty">{strings.board.emptyState}</div>;
  }

  return (
    <div className="pd-board">
      <table className="pd-ledger">
        <thead className="pd-ledger__head">
          <tr>
            <th scope="col">{strings.board.indexHeader}</th>
            <th scope="col">{strings.board.creatorHeader}</th>
            <th scope="col">{strings.board.deliverableHeader}</th>
            <th scope="col">{strings.board.claimedHeader}</th>
            <th scope="col">{strings.board.statusHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <BoardRow
              key={row.claimId}
              row={row}
              index={index + 1}
              locale={locale}
              claimedLabel={strings.board.claimedMarker}
              selected={row.claimId === selectedClaimId}
              onOpen={(el) => openClaim(row.claimId, el)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoardRow({
  row,
  index,
  locale,
  claimedLabel,
  selected,
  onOpen,
}: {
  row: BoardRowView;
  index: number;
  locale: Locale;
  claimedLabel: string;
  selected: boolean;
  onOpen: (triggerEl: HTMLElement) => void;
}) {
  function onKeyDown(event: ReactKeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      // Space must not scroll the page; Enter/Space both open the drawer.
      event.preventDefault();
      onOpen(event.currentTarget);
    }
  }

  return (
    <tr
      className="pd-ledger__row"
      tabIndex={0}
      aria-selected={selected}
      data-claim-id={row.claimId}
      onClick={(event) => onOpen(event.currentTarget)}
      onKeyDown={onKeyDown}
    >
      <td className="pd-ledger__index">{index}</td>
      <td className="pd-ledger__creator">{row.creatorName}</td>
      <td className="pd-ledger__type">{row.deliverableType}</td>
      <td>
        <span className="pd-claimed">{claimedLabel}</span>
      </td>
      <td>
        <StatusStamp status={row.status} locale={locale} />
      </td>
    </tr>
  );
}

/** Three-channel Proof Status stamp (AD-12): colour + shape glyph + uppercase
 *  label. The glyph is decorative (`aria-hidden`); the label carries the meaning
 *  for assistive tech. Pending is a muted, off-scale variant. */
function StatusStamp({ status, locale }: { status: BoardRowStatus; locale: Locale }) {
  if (status.kind === "pending") {
    return (
      <span className="pd-stamp pd-stamp--pending">
        <span className="pd-stamp__glyph" aria-hidden="true">
          {PENDING_TOKEN.glyph}
        </span>
        {locale === "fr" ? PENDING_TOKEN.labelFr : PENDING_TOKEN.labelEn}
      </span>
    );
  }

  const key = proofStatusToDisplayKey(status.status);
  const token = PROOF_STATUS_TOKENS[key];
  return (
    <span className={`pd-stamp pd-stamp--${key}`}>
      <span className="pd-stamp__glyph" aria-hidden="true">
        {token.glyph}
      </span>
      {locale === "fr" ? token.labelFr : token.labelEn}
    </span>
  );
}
