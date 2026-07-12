// app/_lib/report-branding — Client-Safe Report branding composition (Story 4.2,
// FR-12). This is a PRESENTATION concern: it reads the shell-scoped operator
// identity (env, AD-14) and the i18n catalog, NEITHER of which belongs in the
// service layer (AD-2). The report service owns only the raw `byline_removed`
// flag; the shell composes the localized, white-label branding here. Reused by
// the report Route Handlers now and by the Story 4.3 page render later.

import { type ReportBuilderView, resolveOperatorIdentity } from "@/src/services";
import { LOCALE_COOKIE, type Locale, localeStrings, parseLocale } from "./i18n";

/** `decodeURIComponent` throws on a malformed percent-encoding (e.g. `%E0%A4%A`).
 *  A user-controlled cookie must never crash a handler — decode failure falls back
 *  to the default locale, exactly like an unrecognized value. */
function safeDecode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/** Resolve the UI locale from a Route Handler's incoming Request cookie header.
 *  Route Handlers read the request directly (rather than `next/headers cookies()`,
 *  which requires a request scope the handler already is) — this keeps the handler
 *  unit-testable by invoking it with a plain Request. A missing OR malformed cookie
 *  yields the default locale (never a 500 — the cookie is user-controlled). */
export function localeFromRequest(request: Request): Locale {
  const header = request.headers.get("cookie") ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`));
  return parseLocale(match ? safeDecode(match[1]) : undefined);
}

export interface ReportBranding {
  /** The white-label agency identity — the report's PRIMARY identity. ProofDesk
   *  chrome never appears on the client report (UX-DR22). */
  agencyName: string;
  /** Optional agency logo (data-URI); null → the header shows the name only. */
  agencyLogo: string | null;
  /** "Prepared by [Agency] · Proof audit by ProofDesk" — the ONLY ProofDesk
   *  mention on the client report; null when the operator removed it (FR-12). */
  byline: string | null;
}

/** Compose the report's branding from the shell identity + locale + the operator's
 *  per-report byline decision. `bylineRemoved` never affects the appendix (AC4). */
export function composeReportBranding(locale: Locale, bylineRemoved: boolean): ReportBranding {
  const { agency, agencyLogo } = resolveOperatorIdentity();
  return {
    agencyName: agency,
    agencyLogo,
    byline: bylineRemoved ? null : localeStrings(locale).report.byline(agency),
  };
}

/** Wrap ANY refreshed builder view with the shell-composed branding for the HTTP
 *  response. EVERY report Route Handler that returns a `ReportBuilderView` must go
 *  through this so the response shape is uniform (POST/GET report, byline PATCH,
 *  and inclusion PATCH all carry `branding`) — a client can rebuild its report
 *  state from any of them without losing the agency/byline. */
export function withReportBranding(request: Request, view: ReportBuilderView) {
  return {
    ...view,
    branding: composeReportBranding(localeFromRequest(request), view.bylineRemoved),
  };
}
