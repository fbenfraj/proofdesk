import { expect, test } from "@playwright/test";

// SMOKE-ONLY (AD: Playwright is 1-2 paths, not the primary test strategy).
// Assertions are SSR-level: they verify the server-rendered shell + the
// locale→<html lang> persistence path, which does not depend on client
// hydration (the standalone server serves SSR HTML; static-asset serving is a
// deploy concern). The toggle's client cookie-write is simple app/_components
// logic; the harder SSR-consumption half is what these smoke tests pin.

test("operator shell renders behind basic auth", async ({ page }) => {
  // httpCredentials are supplied by playwright.config.ts.
  await page.goto("/");

  // Wordmark (oxblood seal-mark + Proof·Desk).
  await expect(page.getByRole("link", { name: /Proof.?Desk/ })).toBeVisible();

  // Active surface title.
  await expect(page.getByRole("heading", { level: 1, name: "Audit Cockpit" })).toBeVisible();

  // The four surfaces in the rail; Audit Cockpit is the active one.
  const rail = page.getByRole("navigation", { name: "Campaign" });
  await expect(rail.getByRole("link", { name: /Audit Cockpit/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(rail.getByRole("link", { name: /Proof Brief/ })).toBeVisible();
  await expect(rail.getByRole("link", { name: /Evidence Inbox/ })).toBeVisible();
  await expect(rail.getByRole("link", { name: /Client-Safe Report/ })).toBeVisible();
});

test("EN|FR toggle is present with EN active by default", async ({ page }) => {
  await page.goto("/");
  // Buttons are labelled with the full language name for AT; the visible glyph
  // is the compact EN/FR.
  await expect(page.getByRole("button", { name: "English" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Français" })).toBeVisible();
});

test("locale cookie drives <html lang> and persists across surfaces", async ({ page, context }) => {
  await context.addCookies([
    { name: "proofdesk_locale", value: "fr", url: "http://127.0.0.1:3100" },
  ]);

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  // Locked FR glossary term appears in the rail.
  await expect(page.getByRole("link", { name: /Boîte à preuves/ })).toBeVisible();

  // The choice persists onto another surface without re-toggling.
  await page.goto("/client-safe-report");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1, name: "Rapport prêt-client" })).toBeVisible();
});

test("health route responds ok behind basic auth", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toEqual({ status: "ok" });
});

test("unauthenticated request is rejected with 401", async () => {
  // Use global fetch (NOT Playwright's request context, which inherits the
  // config's httpCredentials) so this request carries no Authorization header.
  const res = await fetch("http://127.0.0.1:3100/");
  expect(res.status).toBe(401);
  expect(res.headers.get("www-authenticate")).toContain("Basic");
});
