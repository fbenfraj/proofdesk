// Load `.env` / `.env.local` into process.env for the seed/reset CLIs, so a
// configured `DB_PATH` is honored - exactly like `next dev`. Without this, a bare
// `tsx` run ignores those files and falls back to the default
// `./data/proofdesk.db`; for `reset:demo` that would DELETE and reseed the wrong
// database.
//
// Precedence (highest first): a shell override > `.env.local` > `.env`, matching
// the Next.js convention. `process.loadEnvFile()` NEVER overwrites a variable
// already in process.env, so we load the HIGHER-precedence source FIRST: the
// shell env is already set (so it always wins), then `.env.local` claims the rest,
// then `.env` fills anything still unset.

import { loadEnvFile } from "node:process";

/** Load `.env.local` then `.env` (highest precedence first). A missing file is
 *  fine (matches `--env-file-if-exists`); any OTHER failure - an existing file
 *  that cannot be read or parsed - is surfaced, never silently swallowed, so a
 *  destructive `reset:demo` never falls back to the wrong DB_PATH on a real error. */
export function loadEnvFiles(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      loadEnvFile(file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") continue;
      throw err;
    }
  }
}
