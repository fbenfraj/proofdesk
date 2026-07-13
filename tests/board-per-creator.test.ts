// AI-11 - the Campaign Board is organized per creator. The repo runs Vitest in
// the `node` environment (no jsdom/testing-library), so this pins the render's
// structural guarantees as static source guards, mirroring capture-surface.test.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string): string => readFileSync(`${REPO_ROOT}${rel}`, "utf8");
const BOARD = read("app/_components/proof-board.tsx");

describe("Campaign Board is organized per creator (AI-11)", () => {
  test("groups rows via the grouping helper and renders a creator header per group", () => {
    expect(BOARD).toContain("groupBoardByCreator");
    expect(BOARD).toContain("pd-creator-head");
  });

  test("shows the neutral per-creator deliverable count", () => {
    expect(BOARD).toContain("creatorDeliverableCount");
  });

  test("the redundant per-row Creator column is gone", () => {
    expect(BOARD).not.toContain("pd-ledger__creator");
    expect(BOARD).not.toContain("creatorHeader");
  });
});
