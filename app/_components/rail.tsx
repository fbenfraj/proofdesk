"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Locale, localeStrings, RAIL_SURFACES } from "../_lib/i18n";

// Persistent 214px left rail (UX-DR7). The four operator surfaces in fixed
// order; the active surface carries aria-current="page" (canvas fill + hairline
// + seal icon). Sizes to content with nowrap so the longer FR labels never clip.
// `evidenceCount` is resolved server-side (in the layout) and passed in — the
// Evidence Inbox rail item shows it as a quiet count badge (UX rail-badge,
// Story 2.1); 0 keeps the muted em-dash placeholder, never a saturated dot.
export function Rail({ locale, evidenceCount = 0 }: { locale: Locale; evidenceCount?: number }) {
  const pathname = usePathname();
  const strings = localeStrings(locale);

  return (
    <nav className="pd-rail" aria-label={strings.railCap}>
      <p className="label-caps pd-rail__cap">{strings.railCap}</p>
      <ul className="pd-rail__list">
        {RAIL_SURFACES.map((surface) => {
          // Match the exact path or a nested child (`/href/…`), never a mere
          // prefix — so a sibling like `/proof-brief-archive` can't double-activate.
          const active =
            surface.href === "/"
              ? pathname === "/"
              : pathname === surface.href || pathname.startsWith(`${surface.href}/`);
          return (
            <li key={surface.key}>
              <Link
                href={surface.href}
                className="pd-rail__item"
                aria-current={active ? "page" : undefined}
              >
                <span className="pd-rail__icon" aria-hidden="true">
                  ◆
                </span>
                <span className="pd-rail__label">{strings.rail[surface.key]}</span>
                {"badge" in surface && surface.badge ? (
                  // Quiet count on surface-raised + hairline (UX rail-badge), never
                  // a saturated notification dot. 0 → muted em-dash "no data",
                  // never a fabricated number.
                  <span
                    className="pd-rail__badge label-caps"
                    title={
                      evidenceCount > 0
                        ? strings.railBadgeCount(evidenceCount)
                        : strings.railBadgeEmpty
                    }
                  >
                    {evidenceCount > 0 ? evidenceCount : "-"}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
