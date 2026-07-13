import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { SEED_DEMO_CAMPAIGN_ID } from "@/seed/demo-campaign";
import { getDb } from "@/src/repositories";
import {
  type CampaignStageState,
  type CampaignSummary,
  EMPTY_STAGE_STATE,
  listCampaigns,
  resolveCampaignStageState,
} from "@/src/services";
import { AppShell } from "../_components/app-shell";
import { CAMPAIGN_COOKIE } from "../_lib/campaign-cookie";
import { LOCALE_COOKIE, parseLocale } from "../_lib/i18n";

// Wraps every desktop operator surface (the (ui) route group) in the persistent
// app shell (UX-DR7). The mobile capture surface (app/(capture)) is deliberately
// separate and NOT wrapped. Resolves the active scenario (Story AI-12) + the
// honest stage-strip state (Story AI-10) server-side (AD-2), read-only. Falls back
// to safe empties on an unprovisioned DB rather than 500 the whole shell.
export default async function OperatorLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);

  let stageState: CampaignStageState = EMPTY_STAGE_STATE;
  let activeCampaignId = "";
  let activeCampaignName = "";
  let campaigns: CampaignSummary[] = [];
  try {
    const { db } = getDb();
    // The switcher needs the full campaign list anyway, so resolve the active
    // scenario (id + name) against that already-fetched list in one pass rather
    // than a separate getCampaign validation + name lookup. Same fallback as
    // resolveActiveCampaignId: an absent/stale cookie reverts to the seeded demo.
    campaigns = listCampaigns(db);
    const cookieId = store.get(CAMPAIGN_COOKIE)?.value;
    const active =
      (cookieId ? campaigns.find((c) => c.id === cookieId) : undefined) ??
      campaigns.find((c) => c.id === SEED_DEMO_CAMPAIGN_ID);
    activeCampaignId = active?.id ?? SEED_DEMO_CAMPAIGN_ID;
    activeCampaignName = active?.name ?? "";
    stageState = resolveCampaignStageState(db, activeCampaignId);
  } catch {
    stageState = EMPTY_STAGE_STATE;
  }

  return (
    <AppShell
      locale={locale}
      stageState={stageState}
      activeCampaignId={activeCampaignId}
      activeCampaignName={activeCampaignName}
      campaigns={campaigns}
    >
      {children}
    </AppShell>
  );
}
