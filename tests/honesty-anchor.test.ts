// Story 1.10 — cross-cutting honesty regressions (AD-3, AD-19, AD-22; NFR-D1,
// NFR-D9; BUILD-HANDOFF §5). These are MANDATORY and never skipped: they pin the
// two structural honesty axes at the Epic-1 level.
//
//   Capability-honesty (AD-3/AD-19):
//     1. No path emits a machine-checked label on human-asserted data — every
//        `human-assertion`/`disclosure` requirement's trace sub-fact is `human`.
//     2. screenshot/metric/viewer figures are always Human — the ruleset taxonomy
//        maps them to `human-assertion`, and unknown kinds default to it.
//     3. Seeded screenshot/metric EvidenceItems carry `machine_or_human = human`
//        (link evidence carries `machine`); every seeded row is `data_origin =
//        seeded`.
//     4. No absent-capability code exists in the app — not even stubbed.
//   Liability-honesty (AD-22/NFR-D9):
//     5. No fabricated statistic appears in the copy catalogs or the source.
//
// Scope note: the export-manifest / demo-can't-export / suggested-link /
// HumanConfirmation-survives-recheck honesty tests belong to Epic 2–4 (those
// features do not exist yet) and are asserted when they land.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test } from "vitest";
import { LOCALES, localeStrings } from "@/app/_lib/i18n";
import { type SeedSummary, seedDemoCampaign } from "@/seed/demo-campaign";
import {
  createTestDb,
  type Db,
  type DbHandle,
  listEvidenceItems,
  readAuditResult,
} from "@/src/repositories";
import { DEFAULT_SATISFACTION_TYPE, satisfactionTypeOf } from "@/src/ruleset";
import { resolveEffectiveStatus } from "@/src/services";

const NOW = "2026-07-09T00:00:00.000Z";

// The repo root (this file lives in <root>/tests/).
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

let handle: DbHandle;
let db: Db;
let seed: SeedSummary;

beforeEach(() => {
  handle = createTestDb();
  db = handle.db;
  seed = seedDemoCampaign(db);
});

describe("honesty: no machine-checked label on human-asserted data (AD-3, AD-19)", () => {
  test("every human-assertion / disclosure requirement yields only `human` trace sub-facts", () => {
    // Map each requirement id → its kind, straight from the seed summary.
    const kindByReqId = new Map<string, string>();
    for (const d of seed.deliverables) {
      for (const r of d.requirements) kindByReqId.set(r.proofRequirementId, r.kind);
    }

    for (const d of seed.deliverables) resolveEffectiveStatus(db, d.claimId, NOW);

    let checkedHumanEntries = 0;
    for (const d of seed.deliverables) {
      const res = readAuditResult(db, d.claimId);
      expect(res, `audit result for ${d.key}`).toBeDefined();
      for (const entry of res?.trace ?? []) {
        const kind = kindByReqId.get(entry.requirementId);
        expect(kind, "every trace entry maps to a seeded requirement").toBeDefined();
        const satType = satisfactionTypeOf(kind ?? "");
        if (satType === "human-assertion" || satType === "disclosure") {
          expect(entry.machineOrHuman, `${kind} (${satType}) must never be machine-labelled`).toBe(
            "human",
          );
          checkedHumanEntries += 1;
        }
      }
    }
    // Guard against a vacuous pass: the seeded campaign really does exercise
    // human-asserted requirements (disclosure on 8 claims + supporting metrics).
    expect(checkedHumanEntries).toBeGreaterThan(0);
  });
});

describe("honesty: screenshot/metric/viewer figures are always Human (AD-19)", () => {
  test.each([
    ["reach-metric", "human-assertion"],
    ["segment-timestamp", "human-assertion"],
    ["disclosure-visible", "disclosure"],
    ["proof-of-posting", "link-reachability"],
  ])("satisfactionTypeOf(%s) === %s", (kind, expected) => {
    expect(satisfactionTypeOf(kind)).toBe(expected);
  });

  test("an unknown requirement kind defaults to the conservative human-assertion", () => {
    expect(DEFAULT_SATISFACTION_TYPE).toBe("human-assertion");
    expect(satisfactionTypeOf("some-brand-new-kind")).toBe("human-assertion");
  });
});

describe("honesty: seeded evidence provenance & data_origin (AD-3, AD-9)", () => {
  test("screenshot/metric/attestation items are `human`; link items are `machine`", () => {
    const items = listEvidenceItems(db, seed.campaignId);
    const HUMAN_TYPES = new Set([
      "creator-attestation",
      "disclosure-screenshot",
      "metric-screenshot",
    ]);

    for (const it of items) {
      if (HUMAN_TYPES.has(it.type)) {
        expect(it.machineOrHuman, `${it.type} is a Human assertion`).toBe("human");
      }
      if (it.type === "link") {
        expect(it.machineOrHuman, "a link's reachability is machine-checkable").toBe("machine");
      }
    }
    // Non-vacuous: the seed really contains a human screenshot, a human metric,
    // and a machine link.
    expect(items.some((i) => i.type === "disclosure-screenshot")).toBe(true);
    expect(items.some((i) => i.type === "metric-screenshot")).toBe(true);
    expect(items.some((i) => i.type === "link")).toBe(true);
  });

  test("every seeded EvidenceItem carries data_origin = seeded", () => {
    const items = listEvidenceItems(db, seed.campaignId);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) expect(it.dataOrigin, it.type).toBe("seeded");
  });
});

// --- Static source guards (NFR-D9, AD-22, AD-3) ----------------------------
//
// These scan the PRODUCTION source (app/ · src/ · seed/) — never tests/, which
// legitimately references the banned tokens to guard them.

/** Recursively collect .ts/.tsx files under a set of top-level dirs. */
function collectSourceFiles(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (absDir: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return; // dir absent → nothing to scan
    }
    for (const e of entries) {
      const abs = `${absDir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        walk(abs);
      } else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
        out.push(abs);
      }
    }
  };
  for (const d of dirs) walk(`${REPO_ROOT}${d}`);
  return out;
}

const SOURCE_FILES = collectSourceFiles(["app", "src", "seed"]);

/** Fabricated / stale figures flagged for removal in the PRFAQ (PRD §12.4,
 *  addendum §I). Distinctive tokens only, so bare percentages in CSS never
 *  false-positive. */
const BANNED_STATS = [
  "WFA",
  "Forrester",
  "$1.3B",
  "1.3B fraud",
  "$128K",
  "81% fraud",
  "37% reach",
  "19%→54%",
];

/** Absent capabilities (AD-3): must not exist in the codebase, not even stubbed.
 *  Distinctive identifiers only — deliberately NOT bare platform names
 *  ("Twitch"/"Instagram"/"TikTok" are honest Deliverable-type words in the seed)
 *  and NOT the disclaimer's own negative sentence ("watch streams", "viewer
 *  metrics"). */
const BANNED_CAPABILITY = [
  /\bocr\b/i,
  /tesseract/i,
  /opencv/i,
  /computer[-\s]vision/i,
  /puppeteer/i,
  /\btamper\b/i,
  /googleapis/i,
];

describe("honesty: no fabricated statistics in ProofDesk-derived material (NFR-D9, AD-22)", () => {
  /** Flatten every static string value in a locale catalog. */
  function flattenStrings(value: unknown, out: string[]): void {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) for (const v of value) flattenStrings(v, out);
    else if (value && typeof value === "object") {
      for (const v of Object.values(value)) flattenStrings(v, out);
    }
  }

  test("no banned figure appears in the EN or FR copy catalog", () => {
    for (const locale of LOCALES) {
      const strings: string[] = [];
      flattenStrings(localeStrings(locale), strings);
      const blob = strings.join("\n");
      for (const banned of BANNED_STATS) {
        expect(blob.includes(banned), `${locale} catalog contains banned "${banned}"`).toBe(false);
      }
    }
  });

  test("no banned figure appears anywhere in the app/src/seed source", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(0);
    for (const file of SOURCE_FILES) {
      const text = readFileSync(file, "utf8");
      for (const banned of BANNED_STATS) {
        expect(text.includes(banned), `${file} contains banned "${banned}"`).toBe(false);
      }
    }
  });
});

describe("honesty: absent capabilities stay absent from the codebase (NFR-D1, AD-3)", () => {
  test("no OCR / CV / platform-API / tamper / metric-verification code exists", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(0);
    for (const file of SOURCE_FILES) {
      const text = readFileSync(file, "utf8");
      for (const pattern of BANNED_CAPABILITY) {
        expect(pattern.test(text), `${file} references absent capability ${pattern}`).toBe(false);
      }
    }
  });
});
