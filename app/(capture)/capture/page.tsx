import { cookies } from "next/headers";
import { SEED_DEMO_CAMPAIGN_ID } from "@/seed/demo-campaign";
import { CaptureForm } from "../../_components/capture-form";
import { LOCALE_COOKIE, parseLocale } from "../../_lib/i18n";

// Mobile capture-only surface (Story 2.5, UX-DR8). Deliberately non-responsive:
// no Board, Claim Cards, Proof Brief, or Report here — the `(capture)` route
// group is standalone and NOT wrapped in the desktop AppShell (see
// app/(ui)/layout.tsx). The URL is `/capture`.
//
// A Server Component that only reads the persisted locale cookie (making the
// route dynamic) and renders the client capture form. It does NOT read the DB:
// capture is write-only intake — the form POSTs to the shared /api/evidence
// pipeline, the same one the desktop Inbox uses (no mobile-only code path).
export default async function CaptureHome() {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);

  return <CaptureForm locale={locale} campaignId={SEED_DEMO_CAMPAIGN_ID} />;
}
