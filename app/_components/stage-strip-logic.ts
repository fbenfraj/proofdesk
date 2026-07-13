// Pure logic for the workflow strip (AI-10), split from the client component so
// vitest (node env, no JSX plugin) can import and unit-test it directly. No JSX,
// no next/* imports - just the state->label mapping and route<->stage logic.
import type { CampaignStageState } from "@/src/services";
import { STAGE_STEPS, type StageKey, type Strings } from "../_lib/i18n";

/** The honest per-stage progress signal - workflow progress ONLY. No verdict. */
export function formatStageSignal(state: CampaignStageState, key: StageKey, s: Strings): string {
  const st = s.stage.state;
  switch (key) {
    case "set-the-bar":
      return state.setBar.total === 0
        ? st.setBarNone
        : st.setBarSome(state.setBar.set, state.setBar.total);
    case "collect-evidence":
      return state.collect.count === 0 ? st.collectEmpty : st.collectCount(state.collect.count);
    case "run-the-audit":
      return state.audit.audited === 0 ? st.auditNone : st.auditCount(state.audit.audited);
    case "ship-the-report":
      return state.ship.kind === "ready"
        ? st.shipReady
        : state.ship.kind === "stale"
          ? st.shipStale
          : st.shipNone;
  }
}

/** The persistent "what is this" subhead for a stage - reuses the AI-9 leads. */
export function stageSubhead(s: Strings, key: StageKey): string {
  switch (key) {
    case "set-the-bar":
      return s.proofBrief.lead;
    case "collect-evidence":
      return s.inbox.lead;
    case "run-the-audit":
      return s.board.lead;
    case "ship-the-report":
      return s.report.lead;
  }
}

/** Match the pathname to a stage the same way the old rail did: exact for "/",
 *  else exact-or-nested-child so a sibling route can't double-activate. Falls
 *  back to the Board (the "/" hub) for any unknown path. */
export function activeStageKey(pathname: string): StageKey {
  const match = STAGE_STEPS.find((step) =>
    step.href === "/"
      ? pathname === "/"
      : pathname === step.href || pathname.startsWith(`${step.href}/`),
  );
  return (match ?? STAGE_STEPS.find((s) => s.href === "/")!).key;
}

/** The next journey step after `key`, or null when `key` ends the journey. */
export function nextStage(key: StageKey): (typeof STAGE_STEPS)[number] | null {
  const i = STAGE_STEPS.findIndex((step) => step.key === key);
  return i >= 0 && i < STAGE_STEPS.length - 1 ? STAGE_STEPS[i + 1] : null;
}
