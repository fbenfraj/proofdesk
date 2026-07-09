import type { ReactNode } from "react";

export const metadata = {
  title: "ProofDesk",
  description: "Client-safe proof-of-performance layer for creator campaigns.",
};

// Root layout. The design system, tokens, three type voices, and the EN|FR
// toggle land in Story 1.2 — this is a bare, OS-default shell for Phase 0.
// `lang` defaults to English; the EN|FR toggle will drive it in Story 1.2.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
