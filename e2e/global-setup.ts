import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

// Seed a dedicated, throwaway SQLite DB for the smoke run so the "Run Proof
// Audit" path (Story 1.7) has the seeded demo campaign to resolve — the real
// engine over seeded inputs yields 7·1·1 (AD-9). An ABSOLUTE DB_PATH is used so
// the standalone server (which chdir's into .next/standalone) reads the same
// file this setup seeds; it matches the DB_PATH set on the webServer env.
//
// The standalone static assets are mirrored by the `postbuild` script at build
// time (so pages hydrate) — NOT here, to avoid a test-time filesystem race.
export default function globalSetup(): void {
  const dbPath = path.resolve(process.cwd(), "data/e2e.db");
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${dbPath}${suffix}`;
    if (existsSync(file)) rmSync(file);
  }
  execSync("npm run db:migrate && npm run seed:demo", {
    stdio: "inherit",
    env: { ...process.env, DB_PATH: dbPath },
  });
}
