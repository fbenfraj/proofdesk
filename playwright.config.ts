import { defineConfig } from "@playwright/test";

// Playwright is SMOKE-ONLY (1-2 end-to-end paths). Do not grow this into the
// primary test strategy — correctness lives in Vitest core unit tests.
// The webServer runs the standalone build (AD-15) behind basic-auth (AD-14),
// so the smoke test must present operator credentials via httpCredentials.
const PORT = 3100;
const OPERATOR_USER = process.env.OPERATOR_USER ?? "operator";
const OPERATOR_PASSWORD = process.env.OPERATOR_PASSWORD ?? "changeme";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    httpCredentials: { username: OPERATOR_USER, password: OPERATOR_PASSWORD },
  },
  webServer: {
    // Runs the standalone server (NOT `next start`), matching production run mode.
    command: "node .next/standalone/server.js",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      OPERATOR_USER,
      OPERATOR_PASSWORD,
    },
  },
});
