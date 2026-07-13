import { cookies } from "next/headers";
import { getDb, listInboxEvidenceItems } from "@/src/repositories";
import {
  type DeliverableOption,
  type InboxItemView,
  listDeliverableOptions,
  toEvidenceItemView,
  toInboxItemView,
} from "@/src/services";
import { EvidenceInbox } from "../../_components/evidence-inbox";
import { CAMPAIGN_COOKIE, resolveActiveCampaignId } from "../../_lib/active-campaign";
import { LOCALE_COOKIE, parseLocale } from "../../_lib/i18n";

// Evidence Inbox — the single messy-intake surface (Story 2.1, FR-5) with
// deterministic matching (Story 2.2, FR-6). A Server Component: it reads the
// seeded campaign's inbox receipts + their match state (assigned / suggested /
// unassigned) server-side through the repository seam (AD-2), plus the campaign's
// Deliverables as picker options, and hands plain views to the client inbox. The
// read is strictly READ-ONLY (retro #3) — matching is written at ingest and via
// the confirm/reassign/unassign write endpoints, never on page load. `cookies()`
// makes this route dynamic, so the DB read happens at request time, not at build.
export default async function EvidenceInboxPage() {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);

  let items: InboxItemView[] = [];
  let deliverables: DeliverableOption[] = [];
  let campaignId = "";
  try {
    const { db } = getDb();
    campaignId = resolveActiveCampaignId(db, store.get(CAMPAIGN_COOKIE)?.value);
    items = listInboxEvidenceItems(db, campaignId)
      .map(toEvidenceItemView)
      .map((v) => toInboxItemView(db, v))
      // Newest first — deterministic by uploaded_at then id.
      .sort((a, b) =>
        a.uploadedAt === b.uploadedAt
          ? b.id.localeCompare(a.id)
          : b.uploadedAt.localeCompare(a.uploadedAt),
      );
    deliverables = listDeliverableOptions(db, campaignId);
  } catch {
    items = [];
    deliverables = [];
  }

  return (
    <EvidenceInbox
      locale={locale}
      campaignId={campaignId}
      initialItems={items}
      deliverables={deliverables}
    />
  );
}
