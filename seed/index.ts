// Seed CLI (Story 1.4, NFR-D6). Run with `npm run seed` (applies migrations
// first) or `npm run seed:demo`. The seeding routine lives in `./seed-demo` so
// the `reset:demo` CLI can reuse it.
//
// Idempotent: a re-run skips if the demo Campaign already exists. To force a
// fresh reseed, run `npm run reset:demo` (drops the DB) or delete the gitignored
// `./data/proofdesk.db` and run again.

import { loadEnvFiles } from "./load-env";
import { seedDemo } from "./seed-demo";

// Honor a `.env`-configured DB_PATH, like `next dev` (before opening the DB).
loadEnvFiles();
seedDemo();
