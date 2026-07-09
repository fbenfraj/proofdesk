// Migration application (AD-10). `npm run db:migrate` uses `drizzle-kit migrate`
// against a real DB_PATH; this module lets tests apply the same generated
// migrations to an in-memory DB, and keeps the migrator inside the repository
// seam so no test touches the driver directly.

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb, type DbHandle } from "./db";

const MIGRATIONS_FOLDER = "./drizzle";

/** Apply all generated migrations to an existing handle. */
export function runMigrations(handle: DbHandle, migrationsFolder = MIGRATIONS_FOLDER): void {
  migrate(handle.db, { migrationsFolder });
}

/** Fresh in-memory DB with the full schema applied — for tests. */
export function createTestDb(): DbHandle {
  const handle = createDb(":memory:");
  runMigrations(handle);
  return handle;
}
