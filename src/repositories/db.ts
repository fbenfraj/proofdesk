// The ONLY module that constructs the DB driver (AD-2, AD-10). Everything else
// receives a `Db` handle. Swapping SQLite for EU-sovereign Postgres later (AD-15)
// happens here and nowhere else.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/src/schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface DbHandle {
  db: Db;
  sqlite: Database.Database;
}

/** `true` for in-memory URLs, which have no parent directory to create. */
function isInMemory(url: string): boolean {
  return url === ":memory:" || url.startsWith("file::memory:") || url.includes("mode=memory");
}

/** Open a database at `url` (a file path or `:memory:`). For file-backed URLs
 *  the parent directory is created first — `./data` is gitignored, so a fresh
 *  checkout has no directory for better-sqlite3 to open into (SQLITE_CANTOPEN). */
export function createDb(url: string): DbHandle {
  if (!isInMemory(url)) {
    mkdirSync(dirname(url), { recursive: true });
  }
  const sqlite = new Database(url);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

let singleton: DbHandle | null = null;

/** Process-wide handle backed by `DB_PATH` (default `./data/proofdesk.db`). */
export function getDb(): DbHandle {
  if (!singleton) {
    singleton = createDb(process.env.DB_PATH ?? "./data/proofdesk.db");
  }
  return singleton;
}
