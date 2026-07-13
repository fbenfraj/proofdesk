// The workflow-first stage-strip state (AI-10). READ-ONLY: it composes existing
// read services into the four honest signals the strip shows. It deliberately
// carries NO green/yellow/red - the strip speaks workflow progress, never a
// proof verdict (AD-3/AD-6, retro AI-3), so the verdict palette is structurally
// absent from the type, not just avoided in the UI.
import { countEvidenceItems, type Db } from "@/src/repositories";
import { getCampaignBoard, summarizeReadiness } from "./board";
import { getProofBrief } from "./proof-brief";
import { getLatestReportBuilderView } from "./report";

export type ShipSignal = "none" | "ready" | "stale";

export interface CampaignStageState {
  /** How many deliverables have a proof bar set, of the total. */
  setBar: { set: number; total: number };
  /** Evidence items in the inbox (the old rail badge). */
  collect: { count: number };
  /** How many claims the audit has resolved, of the total - a COUNT only. */
  audit: { audited: number; total: number };
  /** Report assemble-state, honoring snapshot staleness (Story 4-1). */
  ship: { kind: ShipSignal };
}

export const EMPTY_STAGE_STATE: CampaignStageState = {
  setBar: { set: 0, total: 0 },
  collect: { count: 0 },
  audit: { audited: 0, total: 0 },
  ship: { kind: "none" },
};

export function resolveCampaignStageState(db: Db, campaignId: string): CampaignStageState {
  const deliverables = getProofBrief(db, campaignId)?.deliverables ?? [];
  const setBar = {
    set: deliverables.filter((d) => !d.isUnset).length,
    total: deliverables.length,
  };

  const collect = { count: countEvidenceItems(db, campaignId) };

  const readiness = summarizeReadiness(getCampaignBoard(db, campaignId));
  const audit = { audited: readiness.total - readiness.pending, total: readiness.total };

  const report = getLatestReportBuilderView(db, campaignId);
  const kind: ShipSignal = report === null ? "none" : report.stale ? "stale" : "ready";

  return { setBar, collect, audit, ship: { kind } };
}
