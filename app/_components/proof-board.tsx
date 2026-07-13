"use client";

import "./board.css";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect } from "react";
import type { BoardRowStatus, BoardRowView } from "@/src/services";
import { groupBoardByCreator } from "../_lib/board-grouping";
import { PENDING_TOKEN, PROOF_STATUS_TOKENS } from "../_lib/design-tokens";
import { type Locale, localeStrings } from "../_lib/i18n";
import { proofStatusToDisplayKey } from "../_lib/proof-status";
import { useClaimDrawer } from "./claim-drawer-context";

// The claimed-vs-proven ledger (Story 1.6), organized per creator (AI-11):
// Creator is the primary organizing unit, so the flat list is grouped into one
// section per creator (serif name + muted @handle + a neutral deliverable count),
// with the creator's deliverables nested beneath. The per-creator header carries
// identity ONLY, never a proof roll-up; the verdict stays on each row's
// three-channel Proof Status stamp. Rows are keyboard-operable (Enter/Space) and
// open the Claim Card drawer; the selected row carries the surface-raised fill +
// oxblood inset edge (UX-DR12/DR27).
export function ProofBoard({ rows, locale }: { rows: BoardRowView[]; locale: Locale }) {
  const strings = localeStrings(locale);
  const { selectedClaimId, openClaim, registerOrder } = useClaimDrawer();

  // Register the row order so the drawer's step-to-next knows the sequence
  // (UX-DR24). The flat `rows` are already in grouped (creator, type, id) order,
  // so this stays the flat sequence. An effect (not render) so it never sets
  // state during render.
  useEffect(() => {
    registerOrder(rows.map((r) => r.claimId));
  }, [rows, registerOrder]);

  if (rows.length === 0) {
    return <div className="pd-board pd-board__empty">{strings.board.emptyState}</div>;
  }

  const groups = groupBoardByCreator(rows);
  // Global running index (1..N) across all groups, precomputed so the JSX stays
  // free of mutation-in-map.
  let offset = 0;
  const groupsWithOffset = groups.map((group) => {
    const startIndex = offset;
    offset += group.rows.length;
    return { group, startIndex };
  });

  return (
    <div className="pd-board">
      <table className="pd-ledger">
        <thead className="pd-ledger__head">
          <tr>
            <th scope="col">{strings.board.indexHeader}</th>
            <th scope="col">{strings.board.deliverableHeader}</th>
            <th scope="col">{strings.board.claimedHeader}</th>
            <th scope="col">{strings.board.statusHeader}</th>
          </tr>
        </thead>
        {groupsWithOffset.map(({ group, startIndex }) => (
          <tbody key={group.creatorId} className="pd-creator-group">
            <tr className="pd-creator-head">
              <th scope="colgroup" colSpan={4}>
                <span className="pd-creator-head__name">{group.creatorName}</span>
                {group.creatorHandle ? (
                  <span className="pd-creator-head__handle">@{group.creatorHandle}</span>
                ) : null}
                <span className="pd-creator-head__count">
                  {strings.board.creatorDeliverableCount(group.rows.length)}
                </span>
              </th>
            </tr>
            {group.rows.map((row, i) => (
              <BoardRow
                key={row.claimId}
                row={row}
                index={startIndex + i + 1}
                locale={locale}
                claimedLabel={strings.board.claimedMarker}
                selected={row.claimId === selectedClaimId}
                onOpen={(el) => openClaim(row.claimId, el)}
              />
            ))}
          </tbody>
        ))}
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
