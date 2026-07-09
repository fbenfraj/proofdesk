import { expect, test } from "@playwright/test";

// SMOKE-ONLY (AD: Playwright is 1-2 paths, not the primary test strategy).
// Proves the standalone server boots and the basic-auth gate (AD-14) works.

test("operator home renders behind basic auth", async ({ page }) => {
  // httpCredentials are supplied by playwright.config.ts.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ProofDesk" })).toBeVisible();
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
