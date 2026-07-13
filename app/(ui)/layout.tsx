import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { SEED_DEMO_CAMPAIGN_ID } from "@/seed/demo-campaign";
import { getDb } from "@/src/repositories";
import {
  type CampaignStageState,
  EMPTY_STAGE_STATE,
  resolveCampaignStageState,
} from "@/src/services";
import { AppShell } from "../_components/app-shell";
import { LOCALE_COOKIE, parseLocale } from "../_lib/i18n";

// Wraps every desktop operator surface (the (ui) route group) in the persistent
// app shell (UX-DR7). The mobile capture surface (app/(capture)) is
// deliberately separate and NOT wrapped.
export default async function OperatorLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);

  // Honest stage-strip state for the active (seeded) campaign, read server-side
  // (AD-2). Read-only. Falls back to the all-zero EMPTY_STAGE_STATE on an
  // unprovisioned DB rather than 500 the whole shell.
  let stageState: CampaignStageState = EMPTY_STAGE_STATE;
  try {
    const { db } = getDb();
    stageState = resolveCampaignStageState(db, SEED_DEMO_CAMPAIGN_ID);
  } catch {
    stageState = EMPTY_STAGE_STATE;
  }

  return (
    <AppShell locale={locale} stageState={stageState}>
      {children}
    </AppShell>
  );
}
