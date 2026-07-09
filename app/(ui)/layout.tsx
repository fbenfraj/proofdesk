import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "../_components/app-shell";
import { LOCALE_COOKIE, parseLocale } from "../_lib/i18n";

// Wraps every desktop operator surface (the (ui) route group) in the persistent
// app shell (UX-DR7). The mobile capture surface — app/(capture) — is
// deliberately separate and NOT wrapped.
export default async function OperatorLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  return <AppShell locale={locale}>{children}</AppShell>;
}
