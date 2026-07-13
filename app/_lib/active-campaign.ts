import { SEED_DEMO_CAMPAIGN_ID } from "@/seed/demo-campaign";
import { type Db, getCampaign } from "@/src/repositories";

// The active-campaign seam (Story AI-12). Mirrors the locale cookie
// (app/_lib/i18n.ts): a cookie names the active campaign, set client-side by the
// switcher and read server-side by every surface. This is what turns "one
// hardcoded seeded campaign" into "an active campaign you can switch and build up
// live in front of a client."
//
// SERVER ONLY: this module imports the repository (node:fs). The cookie constants
// live in the zero-import ./campaign-cookie so client components can use them
// without dragging server code into the browser bundle. Re-exported here so
// server callers keep a single import site.
export { CAMPAIGN_COOKIE, CAMPAIGN_COOKIE_MAX_AGE } from "./campaign-cookie";

/** Resolve the active campaign id from the cookie value. Validates it against a
 *  real campaign and falls back to the seeded demo when the cookie is absent or
 *  names a campaign that does not exist - a stale cookie must never 500 a surface,
 *  it just reverts to the canonical demo. Never throws. */
export function resolveActiveCampaignId(db: Db, cookieValue: string | undefined | null): string {
  if (!cookieValue) return SEED_DEMO_CAMPAIGN_ID;
  try {
    return getCampaign(db, cookieValue) ? cookieValue : SEED_DEMO_CAMPAIGN_ID;
  } catch {
    return SEED_DEMO_CAMPAIGN_ID;
  }
}
