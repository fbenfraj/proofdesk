// Client-safe active-campaign cookie constants (Story AI-12). Deliberately has
// ZERO imports so a client component (the CampaignSwitcher) can import the cookie
// name/TTL without pulling in the server-only resolver (which imports the
// repository/db layer, i.e. node:fs). Mirrors how LOCALE_COOKIE lives in the
// client-safe i18n module. The server-side resolver lives in ./active-campaign.

/** Cookie naming the active campaign. Same lax/same-site policy as the locale cookie. */
export const CAMPAIGN_COOKIE = "proofdesk_campaign";
export const CAMPAIGN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
