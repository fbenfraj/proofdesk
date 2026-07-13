import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string): string => readFileSync(`${REPO_ROOT}${rel}`, "utf8");

describe("the shell renders the workflow strip, not the rail (AI-10)", () => {
  test("the Rail component is deleted", () => {
    expect(existsSync(`${REPO_ROOT}app/_components/rail.tsx`)).toBe(false);
  });

  test("AppShell renders StageStrip + StageNext, never Rail", () => {
    const shell = read("app/_components/app-shell.tsx");
    expect(shell.includes("StageStrip")).toBe(true);
    expect(shell.includes("StageNext")).toBe(true);
    expect(shell.includes("./rail")).toBe(false);
    expect(shell.includes("<Rail")).toBe(false);
  });

  test("AppShell takes stageState, not the old evidenceCount prop", () => {
    const shell = read("app/_components/app-shell.tsx");
    expect(shell.includes("stageState")).toBe(true);
  });

  test("the (ui) layout resolves the honest stage state server-side", () => {
    const layout = read("app/(ui)/layout.tsx");
    expect(layout.includes("resolveCampaignStageState")).toBe(true);
    expect(layout.includes("EMPTY_STAGE_STATE")).toBe(true);
  });

  // UX-DR24 regression guard: the Claim Card drawer inerts a fixed list of
  // background regions while open. `.pd-strip` (the stage strip, rendered as a
  // sibling OUTSIDE the drawer provider in app-shell.tsx) MUST be in that list —
  // it replaced `.pd-rail`, which no longer exists in the DOM. If `.pd-rail`
  // ever crept back in (or `.pd-strip` fell out), the strip's stage links would
  // stay reachable behind the open modal for assistive-tech users on the Board.
  test("the drawer's BACKGROUND_SELECTORS inert the strip, not the deleted rail", () => {
    const drawer = read("app/_components/claim-drawer.tsx");
    const match = drawer.match(/BACKGROUND_SELECTORS\s*=\s*\[([^\]]*)\]/);
    expect(match, "BACKGROUND_SELECTORS array not found in claim-drawer.tsx").not.toBeNull();
    const selectors = match?.[1] ?? "";
    expect(selectors.includes(".pd-strip")).toBe(true);
    expect(selectors.includes(".pd-rail")).toBe(false);
  });
});
