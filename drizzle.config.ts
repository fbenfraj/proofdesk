import { defineConfig } from "drizzle-kit";

// Drizzle Kit config (AD-10). SQLite via better-sqlite3 now; EU-sovereign
// Postgres is a deferred v2 swap behind the repository seam (AD-15) — the only
// place the dialect changes. Migrations are generated into `./drizzle` and
// applied via `npm run db:migrate` (NOT wired into `ci` — CI stays a pure
// quality gate; the long-lived host owns migrate/deploy, Build-Handoff §8).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DB_PATH ?? "./data/proofdesk.db",
  },
});
