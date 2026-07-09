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

test("audit cockpit renders the claimed-vs-proven board region", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Audit Cockpit" })).toBeVisible();
  // The board mounts server-side (ledger table when seeded, else the empty
  // state) — either way the cockpit renders without a server error (Story 1.6).
  await expect(page.locator(".pd-board")).toBeVisible();
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

test("Run Proof Audit resolves the seeded board to 7·1·1 with the readiness summary (Story 1.7)", async ({
  page,
}) => {
  await page.goto("/");
  // The run button is a native, focusable control (UX-DR18).
  const run = page.getByRole("button", { name: /Run Proof Audit/ });
  await expect(run).toBeVisible();

  // Click then wait for the reveal to settle into the magic-moment multiset.
  // Wrapped in toPass so a click that races client hydration is retried — the
  // run is idempotent (AD-6), so an extra click is harmless. Board stamps are
  // three-channel; the display keys carry the R/Y/G buckets.
  await expect(async () => {
    await run.click();
    await expect(page.locator(".pd-stamp--defensible")).toHaveCount(7, { timeout: 3000 });
  }).toPass({ timeout: 15000 });
  await expect(page.locator(".pd-stamp--caveated")).toHaveCount(1);
  await expect(page.locator(".pd-stamp--cant-claim")).toHaveCount(1);

  // The Proof-Readiness summary shows transparent counts + the reading note —
  // never an opaque score.
  const readiness = page.getByRole("region", { name: "Proof-Readiness" });
  await expect(readiness).toContainText("Defensible");
  await expect(readiness).toContainText("ProofDesk can back 7");

  // The aria-live region announces the outcome verbatim, once (UX-DR25, AC4).
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    "Audit complete. 7 Defensible, 1 Caveated, 1 Can't claim. You marked 9 of 9 done; ProofDesk can back 7.",
  );

  // After running, the button flips to the re-run label with a mono timestamp.
  await expect(page.getByRole("button", { name: /Re-run Proof Audit · last run/ })).toBeVisible();
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("renders the identical final resolved DOM immediately (NFR-D7)", async ({ page }) => {
    await page.goto("/");
    const run = page.getByRole("button", { name: /Proof Audit/ });
    // No staging: the final 7·1·1 DOM is present without waiting on animation.
    // toPass retries a click that races hydration (idempotent run).
    await expect(async () => {
      await run.click();
      await expect(page.locator(".pd-stamp--defensible")).toHaveCount(7, { timeout: 2000 });
    }).toPass({ timeout: 15000 });
    await expect(page.locator(".pd-stamp--caveated")).toHaveCount(1);
    await expect(page.locator(".pd-stamp--cant-claim")).toHaveCount(1);
  });
});

test("FR run button renders the locked glossary label without truncation", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "proofdesk_locale", value: "fr", url: "http://127.0.0.1:3100" },
  ]);
  await page.goto("/");
  // Locked FR term "Lancer l'audit" (or its re-run form if a prior test ran the
  // audit against the shared DB); the control renders and is not clipped.
  const run = page.getByRole("button", { name: /l’audit/ });
  await expect(run).toBeVisible();
  const clipped = await run.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped).toBe(false);
});

test.describe("Claim Card drawer (Story 1.8)", () => {
  // Ensure the seeded board is audited (idempotent) so the opened card shows the
  // resolved facts, then return the first row's claim id.
  async function auditAndFirstClaim(page: import("@playwright/test").Page) {
    await page.goto("/");
    // Locale-agnostic: matches EN "Run Proof Audit" and FR "Lancer l’audit".
    const run = page.getByRole("button", { name: /audit/i });
    await expect(async () => {
      await run.click();
      await expect(page.locator(".pd-stamp--defensible")).toHaveCount(7, { timeout: 3000 });
    }).toPass({ timeout: 15000 });
    const firstRow = page.locator(".pd-ledger__row").first();
    const claimId = await firstRow.getAttribute("data-claim-id");
    return { firstRow, claimId };
  }

  test("opens as a dialog with the five sections + provenance, Esc closes and returns focus to the row", async ({
    page,
  }) => {
    const { firstRow, claimId } = await auditAndFirstClaim(page);

    // Open from the row (retry a click that races hydration).
    await expect(async () => {
      await firstRow.click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    // The dialog is labelled by its sticky <h2> title.
    await expect(dialog.getByRole("heading", { level: 2 })).toBeVisible();

    // The five hairline-divided sections, in order (UX-DR13).
    for (const name of [
      "Proof Requirements",
      "Evidence trail",
      "Machine/Human facts",
      "Caveat",
      "Human override",
    ]) {
      await expect(dialog.getByRole("region", { name })).toBeVisible();
    }

    // Provenance chips render (cool-slate machine / warm-taupe human), OFF the
    // R/Y/G scale (UX-DR10).
    await expect(dialog.locator(".pd-prov").first()).toBeVisible();

    // The background is inert while the dialog is open (UX-DR24).
    expect(await page.locator(".pd-main").getAttribute("inert")).not.toBeNull();

    // Esc closes; focus returns to the exact originating row (UX-DR24).
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".pd-main")).not.toHaveAttribute("inert", /.*/);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-claim-id")))
      .toBe(claimId);
  });

  test("a failed claim-card load still moves focus into the dialog (not the inert background)", async ({
    page,
  }) => {
    const { firstRow } = await auditAndFirstClaim(page);
    // Force the claim-card fetch to fail so the drawer stays in its error state.
    await page.route("**/api/claims/**", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );

    await expect(async () => {
      await firstRow.click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    // Even with no card content, focus must be INSIDE the drawer — never left on
    // the now-inert background (UX-DR24).
    await expect
      .poll(() =>
        page.evaluate(() => {
          const drawer = document.querySelector(".pd-drawer");
          return drawer ? drawer.contains(document.activeElement) : false;
        }),
      )
      .toBe(true);
    // And the background is inert.
    expect(await page.locator(".pd-main").getAttribute("inert")).not.toBeNull();
  });

  test("step-to-next-claim advances without closing", async ({ page }) => {
    const { firstRow } = await auditAndFirstClaim(page);
    await expect(async () => {
      await firstRow.click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    const dialog = page.getByRole("dialog");
    const firstTitle = await dialog.getByRole("heading", { level: 2 }).textContent();
    await dialog.getByRole("button", { name: "Next claim" }).click();
    // Still open, and the heading updated to the next claim.
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect
      .poll(() => page.getByRole("dialog").getByRole("heading", { level: 2 }).textContent())
      .not.toBe(firstTitle);
  });

  test("FR drawer renders the locked provenance term without truncation", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "proofdesk_locale", value: "fr", url: "http://127.0.0.1:3100" },
    ]);
    await auditAndFirstClaim(page);
    await expect(async () => {
      await page.locator(".pd-ledger__row").first().click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    const chip = page.getByRole("dialog").locator(".pd-prov").first();
    await expect(chip).toBeVisible();
    // Locked FR glossary terms; the chip is size-to-content and not clipped.
    await expect(chip).toHaveText(/Fait vérifié par la machine|Déclaration humaine/);
    const clipped = await chip.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped).toBe(false);
  });
});

test.describe("Human override & caveat (Story 1.9)", () => {
  // Audit the seeded board (idempotent) then open the first claim card.
  async function openFirstClaim(page: import("@playwright/test").Page) {
    await page.goto("/");
    const run = page.getByRole("button", { name: /audit/i });
    await expect(async () => {
      await run.click();
      await expect(page.locator(".pd-stamp--defensible")).toHaveCount(7, { timeout: 3000 });
    }).toPass({ timeout: 15000 });
    const firstRow = page.locator(".pd-ledger__row").first();
    await expect(async () => {
      await firstRow.click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });
    return page.getByRole("dialog");
  }

  test("override switch sets the effective status while the machine verdict stays pinned + attributed", async ({
    page,
  }) => {
    const dialog = await openFirstClaim(page);
    const override = dialog.getByRole("region", { name: "Human override" });

    // The machine verdict is pinned before any override (AD-6).
    await expect(override.getByText("Machine verdict", { exact: true })).toBeVisible();

    // The switch is a real role="switch", off by default with an ever-present word.
    const toggle = override.getByRole("switch", { name: "Operator override" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    // Turn it on → the three Proof Status options appear; choose "Can't claim".
    await toggle.click();
    await override.getByRole("button", { name: "Can't claim" }).click();

    // The switch reads on, the machine verdict is STILL visible (never hidden),
    // and the change is attributed "by [operator] · [agency]".
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(override.getByText("Machine verdict", { exact: true })).toBeVisible();
    await expect(override.getByText(/by operator · ProofDesk/)).toBeVisible();

    // Toggling off clears the override.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("a caveat records with its operator attribution", async ({ page }) => {
    const dialog = await openFirstClaim(page);
    const caveatSection = dialog.getByRole("region", { name: "Caveat" });

    await caveatSection.getByRole("button", { name: /Add caveat/ }).click();
    await caveatSection
      .getByRole("textbox", { name: "Caveat" })
      .fill("Rests on the creator's word — needs a timestamped clip.");
    await caveatSection.getByRole("button", { name: "Record caveat" }).click();

    // The caveat surfaces with its mono "by [operator]" attribution.
    await expect(
      caveatSection.getByText("Rests on the creator's word — needs a timestamped clip."),
    ).toBeVisible();
    await expect(caveatSection.getByText("by operator")).toBeVisible();
  });
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
