import { cookies } from "next/headers";
import { SEED_DEMO_CAMPAIGN_ID } from "@/seed/demo-campaign";
import { getDb } from "@/src/repositories";
import { type BoardRowView, getCampaignBoard } from "@/src/services";
import { AuditCockpit } from "../_components/audit-cockpit";
import { LOCALE_COOKIE, parseLocale } from "../_lib/i18n";

// Audit Cockpit home — the claimed-vs-proven Board + "Run Proof Audit" (Stories
// 1.6/1.7). A Server Component: it reads the seeded campaign server-side through
// the service seam (AD-2) and hands plain rows to the client cockpit. The read
// is strictly read-only — before "Run Proof Audit" persists any AuditResult,
// every row reads `pending`, and loading the board never runs the audit itself
// (the explicit button POSTs /api/audit, the ONLY write-capable path).
// `cookies()` already makes this route dynamic, so the DB read happens at
// request time, never at build.
export default async function AuditCockpitPage() {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);

  let rows: BoardRowView[] = [];
  try {
    const { db } = getDb();
    rows = getCampaignBoard(db, SEED_DEMO_CAMPAIGN_ID);
  } catch {
    // Unprovisioned/empty database (e.g. before `npm run seed`): fall back to the
    // empty state rather than 500 the cockpit. The seeded demo is the only wired
    // campaign for now (AD-9).
    rows = [];
  }

  return (
    <section>
      <AuditCockpit initialRows={rows} locale={locale} campaignId={SEED_DEMO_CAMPAIGN_ID} />
    </section>
  );
}
