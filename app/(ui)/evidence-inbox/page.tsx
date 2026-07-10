import { cookies } from "next/headers";
import { SEED_DEMO_CAMPAIGN_ID } from "@/seed/demo-campaign";
import { getDb, listInboxEvidenceItems } from "@/src/repositories";
import { type EvidenceItemView, toEvidenceItemView } from "@/src/services";
import { EvidenceInbox } from "../../_components/evidence-inbox";
import { LOCALE_COOKIE, parseLocale } from "../../_lib/i18n";

// Evidence Inbox — the single messy-intake surface (Story 2.1, FR-5). A Server
// Component: it reads the seeded campaign's evidence server-side through the
// repository seam (AD-2) and hands plain views to the client inbox, which posts
// new receipts to /api/evidence and prepends the returned view. The read is
// strictly read-only. `cookies()` makes this route dynamic, so the DB read
// happens at request time, never at build.
export default async function EvidenceInboxPage() {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);

  let items: EvidenceItemView[] = [];
  try {
    const { db } = getDb();
    items = listInboxEvidenceItems(db, SEED_DEMO_CAMPAIGN_ID)
      .map(toEvidenceItemView)
      // Newest first — deterministic by uploaded_at then id.
      .sort((a, b) =>
        a.uploadedAt === b.uploadedAt
          ? b.id.localeCompare(a.id)
          : b.uploadedAt.localeCompare(a.uploadedAt),
      );
  } catch {
    items = [];
  }

  return <EvidenceInbox locale={locale} campaignId={SEED_DEMO_CAMPAIGN_ID} initialItems={items} />;
}
