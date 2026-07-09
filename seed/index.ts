// Seed CLI (Story 1.4, NFR-D6) — the imperative shell around the pure
// `seedDemoCampaign` builder. Run with `npm run seed` (applies migrations first)
// or `npm run seed:demo`. It targets the real `DB_PATH` database.
//
// Idempotent: if the demo Campaign already exists it skips without writing, so a
// re-run never duplicates rows or violates the append-only HumanConfirmation
// rule (AD-18). To force a fresh reseed in dev, delete the gitignored
// `./data/proofdesk.db` and run again.

import { getCampaign, getDb, runMigrations } from "@/src/repositories";
import { SEED_DEMO_CAMPAIGN_ID, SEED_DEMO_CAMPAIGN_NAME, seedDemoCampaign } from "./demo-campaign";

function main(): void {
  const handle = getDb();
  runMigrations(handle);

  if (getCampaign(handle.db, SEED_DEMO_CAMPAIGN_ID)) {
    console.log(
      `Demo campaign already seeded (${SEED_DEMO_CAMPAIGN_ID}) — skipping. ` +
        "Delete ./data/proofdesk.db to reseed.",
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
      "(the engine computes it in Story 1.5 — no verdict is stored here).",
  );
}

main();
