import "./globals.css";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { LOCALE_COOKIE, parseLocale } from "./_lib/i18n";
import { fontVariables } from "./fonts";

export const metadata = {
  title: "ProofDesk",
  description: "Client-safe proof-of-performance layer for creator campaigns.",
};

// Root layout. Reads the persisted locale cookie server-side so <html lang> is
// correct on first paint (no flash), and applies the three embedded type-voice
// font variables (UX-DR4). The design tokens live in ./globals.css.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);

  return (
    <html lang={locale} className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
