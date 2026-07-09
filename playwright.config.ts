import path from "node:path";
import { defineConfig } from "@playwright/test";

// Playwright is SMOKE-ONLY (1-2 end-to-end paths). Do not grow this into the
// primary test strategy — correctness lives in Vitest core unit tests.
// The webServer runs the standalone build (AD-15) behind basic-auth (AD-14),
// so the smoke test must present operator credentials via httpCredentials.
const PORT = 3100;
const OPERATOR_USER = process.env.OPERATOR_USER ?? "operator";
const OPERATOR_PASSWORD = process.env.OPERATOR_PASSWORD ?? "changeme";
// A throwaway seeded DB (see e2e/global-setup.ts). Absolute so the standalone
// server reads the same file the setup seeded, regardless of its own cwd.
const DB_PATH = path.resolve(process.cwd(), "data/e2e.db");

export default defineConfig({
  testDir: "./e2e",
  // Serialized: the hydration-dependent Run-Proof-Audit smoke paths race the
  // standalone server's cold start under parallel load. The suite is tiny and
  // smoke-only, so one worker keeps it deterministic (runs in ~7s).
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  // Seeds the demo campaign into DB_PATH before the webServer boots (Story 1.7).
  globalSetup: "./e2e/global-setup.ts",
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
      DB_PATH,
    },
  },
});
