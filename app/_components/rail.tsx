"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Locale, localeStrings, RAIL_SURFACES } from "../_lib/i18n";

// Persistent 214px left rail (UX-DR7). The four operator surfaces in fixed
// order; the active surface carries aria-current="page" (canvas fill + hairline
// + seal icon). Sizes to content with nowrap so the longer FR labels never clip.
export function Rail({ locale }: { locale: Locale }) {
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
                  // Quiet placeholder — no campaign is wired yet, so there is no
                  // real evidence count to show (AD-9). The em-dash reads as
                  // "no data", never a fabricated number. Story 2.1 wires it.
                  <span className="pd-rail__badge label-caps" title={strings.railBadgeEmpty}>
                    —
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
