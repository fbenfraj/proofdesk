// Reset CLI (Epic 4 retro, AI-8). `npm run reset:demo` drops the DB_PATH
// database and re-seeds a known-clean demo, so the demo is re-runnable in front
// of a client without stale evidence, overrides, or reports left over from a
// prior run.
//
// Unlike `seed:demo` (idempotent, skips when present), this DESTROYS the current
// database first (main file + WAL/SHM sidecars) and rebuilds it from migrations
// + the demo seed. Dev/demo tool only: it deletes data unconditionally, so it is
// never wired into `ci` and must not run against a real-data database.

import { rmSync } from "node:fs";
import { loadEnvFiles } from "./load-env";
import { seedDemo } from "./seed-demo";

const DEFAULT_DB_PATH = "./data/proofdesk.db";

/** Mirror of the driver's in-memory check (src/repositories/db.ts) — an
 *  in-memory DB has no file to drop, so a fresh process is already clean. */
function isInMemory(url: string): boolean {
  return url === ":memory:" || url.startsWith("file::memory:") || url.includes("mode=memory");
}

function main(): void {
  // Honor a `.env`-configured DB_PATH before we resolve WHICH file to delete.
  loadEnvFiles();
  const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;

  if (isInMemory(dbPath)) {
    console.log("DB_PATH is in-memory - nothing on disk to drop; seeding a clean demo…");
    seedDemo();
    return;
  }

  // Drop the SQLite file and its WAL/SHM sidecars (journal_mode = WAL). `force`
  // makes a missing file a no-op, so reset works on a fresh checkout too. This
  // runs BEFORE any DB handle is opened, so the singleton opens the fresh file.
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
  console.log(`Dropped ${dbPath} (+ WAL/SHM) - reseeding a clean demo…`);

  seedDemo();
}

main();
