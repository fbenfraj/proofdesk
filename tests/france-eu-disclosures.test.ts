// Story 3.3 — the France/EU disclosure checklist palette is honest, versioned
// data: every item is a `disclosure` satisfaction kind (so the three-tier
// severity governs it), critical by default, and "collaboration commerciale" is
// the one locked verbatim-French term.

import { beforeEach, describe, expect, test } from "vitest";
import { seedDemoCampaign } from "@/seed/demo-campaign";
import {
  createTestDb,
  type Db,
  type DbHandle,
  listProofRequirementsForDeliverable,
} from "@/src/repositories";
import {
  FRANCE_EU_DISCLOSURE,
  FRANCE_EU_DISCLOSURES,
  franceEuDisclosure,
  isFranceEuDisclosure,
  satisfactionTypeOf,
} from "@/src/ruleset";

describe("France/EU disclosure palette (FR-4)", () => {
  test.each(FRANCE_EU_DISCLOSURE)("%s is a critical disclosure requirement", (key) => {
    const spec = franceEuDisclosure(key);
    expect(spec.kind).toBe("disclosure-visible");
    // Routed through the taxonomy → the three-tier disclosure dimension governs it.
    expect(satisfactionTypeOf(spec.kind)).toBe("disclosure");
    expect(spec.criticality).toBe("critical");
    expect(spec.label.length).toBeGreaterThan(0);
  });

  test("all three items are the verbatim French mandated mentions (loi Influenceurs art. 5)", () => {
    // Every item is the exact legally-required French mention, rendered verbatim.
    expect(FRANCE_EU_DISCLOSURES["collaboration-commerciale"].label).toBe(
      "collaboration commerciale",
    );
    expect(FRANCE_EU_DISCLOSURES["images-retouchees"].label).toBe("images retouchées");
    expect(FRANCE_EU_DISCLOSURES["images-virtuelles"].label).toBe("images virtuelles");
    for (const key of FRANCE_EU_DISCLOSURE) {
      expect(FRANCE_EU_DISCLOSURES[key].verbatimFrench, key).toBe(true);
    }
    // The epic placeholder "influenceur" is NOT a real mandated label — it must
    // not exist in the confirmed registry (empty-and-honest over guessed).
    expect(Object.keys(FRANCE_EU_DISCLOSURES)).not.toContain("influenceur");
  });

  test.each(FRANCE_EU_DISCLOSURE)("isFranceEuDisclosure recognizes %s", (key) => {
    expect(isFranceEuDisclosure(key)).toBe(true);
  });

  test("isFranceEuDisclosure rejects prototype-chain names + unknown/null values", () => {
    // Own-property check: inherited props must NOT be treated as valid keys.
    for (const bogus of ["__proto__", "toString", "constructor", "hasOwnProperty"]) {
      expect(isFranceEuDisclosure(bogus)).toBe(false);
    }
    expect(isFranceEuDisclosure("some-custom-disclosure")).toBe(false);
    expect(isFranceEuDisclosure(null)).toBe(false);
    expect(isFranceEuDisclosure(undefined)).toBe(false);
  });

  test("the registry is exactly the three real mandated mentions", () => {
    expect([...FRANCE_EU_DISCLOSURE].sort()).toEqual([
      "collaboration-commerciale",
      "images-retouchees",
      "images-virtuelles",
    ]);
  });
});

describe("seeded disclosure requirements are keyed (fresh-data consistency, Story 3.3)", () => {
  let handle: DbHandle;
  let db: Db;

  beforeEach(() => {
    handle = createTestDb();
    db = handle.db;
  });

  test("every seeded disclosure-visible requirement carries the collaboration-commerciale key", () => {
    const seed = seedDemoCampaign(db);
    let checked = 0;
    for (const d of seed.deliverables) {
      for (const r of listProofRequirementsForDeliverable(db, d.deliverableId)) {
        if (r.kind === "disclosure-visible") {
          expect(r.disclosureKey).toBe("collaboration-commerciale");
          checked += 1;
        }
      }
    }
    // Non-vacuous: the seed really carries disclosure requirements.
    expect(checked).toBeGreaterThan(0);
  });
});
