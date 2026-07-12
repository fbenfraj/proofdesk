import { cookies } from "next/headers";
import { SEED_DEMO_CAMPAIGN_ID } from "@/seed/demo-campaign";
import { getCampaign, getDb } from "@/src/repositories";
import { getStorage } from "@/src/storage";
import { ClientSafeReport } from "../../_components/client-safe-report";
import { LOCALE_COOKIE, parseLocale } from "../../_lib/i18n";
import { assembleReportDocumentHtml } from "../../_lib/report-document";

// Client-Safe Report — the operator's export surface (Story 4.3, FR-14). A Server
// Component: it assembles the self-contained document server-side through the
// shell builder (which reads the frozen builder view + inlines evidence via the
// storage adapter, AD-2/AD-10) and hands the opaque HTML to the client preview.
// The seeded demo is the only wired campaign for now (AD-9); rendering its report
// on-screen is allowed even though export is disabled for demos (Story 4.4).
// `cookies()` makes this route dynamic, so the read happens at request time.
export default async function ClientSafeReportPage() {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);

  let html: string | null = null;
  // The seeded demo is `is_demo = true` (AD-9), so the shipped surface correctly
  // shows the SAMPLE marker + a disabled Download — the export hard-wall made
  // visible. Default to demo when the campaign can't be read (empty DB) so the UI
  // never offers an export it can't honestly fulfil.
  let isDemo = true;
  try {
    const { db } = getDb();
    html = await assembleReportDocumentHtml(db, getStorage(), SEED_DEMO_CAMPAIGN_ID, locale);
    isDemo = getCampaign(db, SEED_DEMO_CAMPAIGN_ID)?.isDemo ?? true;
  } catch {
    // Unprovisioned/empty database (e.g. before `npm run seed`): show the empty
    // state rather than 500 the surface.
    html = null;
  }

  return (
    <ClientSafeReport
      html={html}
      locale={locale}
      campaignId={SEED_DEMO_CAMPAIGN_ID}
      isDemo={isDemo}
    />
  );
}
