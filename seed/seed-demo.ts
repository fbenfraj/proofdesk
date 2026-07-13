// The reusable demo-seed routine (Story 1.4, NFR-D6) — the imperative shell
// around the pure `seedDemoCampaign` builder. Shared by the `seed:demo` CLI
// (seed/index.ts) and the `reset:demo` CLI (seed/reset.ts). Targets the real
// `DB_PATH` database.
//
// Idempotent: if the demo Campaign already exists it skips without writing, so a
// re-run never duplicates rows or violates the append-only HumanConfirmation
// rule (AD-18). `reset:demo` clears the database first, so it always seeds fresh.

import { getCampaign, getDb, runMigrations } from "@/src/repositories";
import { SEED_DEMO_CAMPAIGN_ID, SEED_DEMO_CAMPAIGN_NAME, seedDemoCampaign } from "./demo-campaign";

/** Apply migrations, then seed the demo campaign unless it is already present. */
export function seedDemo(): void {
  const handle = getDb();
  runMigrations(handle);

  if (getCampaign(handle.db, SEED_DEMO_CAMPAIGN_ID)) {
    console.log(
      `Demo campaign already seeded (${SEED_DEMO_CAMPAIGN_ID}) - skipping. ` +
        "Run `npm run reset:demo` to drop and reseed a clean demo.",
    );
    return;
  }

  const summary = seedDemoCampaign(handle.db);
  const intents = summary.deliverables.map((d) => d.intendedVerdict);
  const count = (v: string) => intents.filter((x) => x === v).length;
  console.log(
    `Seeded "${SEED_DEMO_CAMPAIGN_NAME}" (${summary.campaignId}): ` +
      `${summary.deliverables.length} Deliverables across ${summary.creators.length} Creators. ` +
      `Designed audit outcome: ${count("green")} Green · ${count("yellow")} Yellow · ${count("red")} Red ` +
      "(the engine computes it in Story 1.5 - no verdict is stored here).",
  );
}
