import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { SEED_DEMO_CAMPAIGN_ID } from "@/seed/demo-campaign";
import { countEvidenceItems, getDb } from "@/src/repositories";
import { AppShell } from "../_components/app-shell";
import { LOCALE_COOKIE, parseLocale } from "../_lib/i18n";

// Wraps every desktop operator surface (the (ui) route group) in the persistent
// app shell (UX-DR7). The mobile capture surface — app/(capture) — is
// deliberately separate and NOT wrapped.
export default async function OperatorLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);

  // Evidence Inbox rail-badge count for the active (seeded) campaign, read
  // server-side (AD-2). Read-only. Falls back to 0 on an unprovisioned DB rather
  // than 500 the whole shell.
  let evidenceCount = 0;
  try {
    const { db } = getDb();
    evidenceCount = countEvidenceItems(db, SEED_DEMO_CAMPAIGN_ID);
  } catch {
    evidenceCount = 0;
  }

  return (
    <AppShell locale={locale} evidenceCount={evidenceCount}>
      {children}
    </AppShell>
  );
}
