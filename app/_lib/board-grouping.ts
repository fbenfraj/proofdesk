import type { BoardRowView } from "@/src/services";

/** One creator and the board rows that belong to them, in incoming order. AI-11
 *  makes Creator the primary organizing unit on the Board, so the flat ledger is
 *  rendered as one section per CreatorGroup. Identity + rows only: there is no
 *  per-creator proof roll-up (the verdict stays on the per-deliverable stamp). */
export interface CreatorGroup {
  creatorId: string;
  creatorName: string;
  creatorHandle: string | null;
  rows: BoardRowView[];
}

/** Group already-ordered board rows into contiguous per-creator sections.
 *  `listCampaignBoardRows` orders rows (creator name, creator id, type, id) so a
 *  creator's rows are always adjacent; this is a single linear pass that preserves
 *  that order and never re-sorts. Grouping is keyed on creatorId (stable identity),
 *  so two creators who share a display name still form two groups. */
export function groupBoardByCreator(rows: BoardRowView[]): CreatorGroup[] {
  const groups: CreatorGroup[] = [];
  let current: CreatorGroup | null = null;
  for (const row of rows) {
    if (current === null || current.creatorId !== row.creatorId) {
      current = {
        creatorId: row.creatorId,
        creatorName: row.creatorName,
        creatorHandle: row.creatorHandle,
        rows: [],
      };
      groups.push(current);
    }
    current.rows.push(row);
  }
  return groups;
}
