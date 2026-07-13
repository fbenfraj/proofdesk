import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  activeStageKey,
  formatStageSignal,
  nextStage,
  stageSubhead,
} from "@/app/_components/stage-strip-logic";
import { localeStrings } from "@/app/_lib/i18n";
import { EMPTY_STAGE_STATE } from "@/src/services";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string): string => readFileSync(`${REPO_ROOT}${rel}`, "utf8");
const s = localeStrings("en");

describe("activeStageKey maps a pathname to a stage (mirrors the old rail logic)", () => {
  test.each([
    ["/", "run-the-audit"],
    ["/proof-brief", "set-the-bar"],
    ["/evidence-inbox", "collect-evidence"],
    ["/client-safe-report", "ship-the-report"],
    ["/evidence-inbox/anything", "collect-evidence"],
    ["/unknown", "run-the-audit"],
  ])("%s -> %s", (path, key) => {
    expect(activeStageKey(path)).toBe(key);
  });
});

describe("nextStage returns the next journey step, null on the last", () => {
  test("run-the-audit -> ship-the-report", () => {
    expect(nextStage("run-the-audit")?.key).toBe("ship-the-report");
  });
  test("ship-the-report -> null (journey ends)", () => {
    expect(nextStage("ship-the-report")).toBeNull();
  });
});

describe("formatStageSignal renders honest workflow progress (never a verdict)", () => {
  test("empty states", () => {
    expect(formatStageSignal(EMPTY_STAGE_STATE, "set-the-bar", s)).toBe("not started");
    expect(formatStageSignal(EMPTY_STAGE_STATE, "collect-evidence", s)).toBe("empty");
    expect(formatStageSignal(EMPTY_STAGE_STATE, "run-the-audit", s)).toBe("not run");
    expect(formatStageSignal(EMPTY_STAGE_STATE, "ship-the-report", s)).toBe("not yet");
  });
  test("populated states", () => {
    const state = {
      setBar: { set: 3, total: 5 },
      collect: { count: 12 },
      audit: { audited: 8, total: 9 },
      ship: { kind: "stale" as const },
    };
    expect(formatStageSignal(state, "set-the-bar", s)).toBe("3 of 5 set");
    expect(formatStageSignal(state, "collect-evidence", s)).toBe("12 in inbox");
    expect(formatStageSignal(state, "run-the-audit", s)).toBe("8 audited");
    expect(formatStageSignal(state, "ship-the-report", s)).toBe("needs re-assembly");
  });
});

describe("stageSubhead reuses the AI-9 surface leads (no duplicate copy)", () => {
  test("each stage maps to its existing lead", () => {
    expect(stageSubhead(s, "set-the-bar")).toBe(s.proofBrief.lead);
    expect(stageSubhead(s, "collect-evidence")).toBe(s.inbox.lead);
    expect(stageSubhead(s, "run-the-audit")).toBe(s.board.lead);
    expect(stageSubhead(s, "ship-the-report")).toBe(s.report.lead);
  });
});

describe("the strip never speaks the proof-verdict palette (honesty guard)", () => {
  test("component + logic source reference no verdict color or word", () => {
    const src =
      read("app/_components/stage-strip.tsx") + read("app/_components/stage-strip-logic.ts");
    for (const banned of ["--green", "--yellow", "--red", "pd-stamp", "Defensible", "Caveated"]) {
      expect(src.includes(banned), `stage-strip must not reference ${banned}`).toBe(false);
    }
  });
});
