import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  PALETTE,
  PENDING_TOKEN,
  PROOF_STATUS_TOKENS,
  PROVENANCE_TOKENS,
  STATUS_ORDER,
} from "@/app/_lib/design-tokens";

describe("Proof Status vocabulary (UX-DR2, three-channel AD-12)", () => {
  test("status order is green → amber → red", () => {
    expect(STATUS_ORDER).toEqual(["defensible", "caveated", "cant-claim"]);
  });

  test.each([
    ["defensible", "●", "DEFENSIBLE", "DÉFENDABLE"],
    ["caveated", "◐", "CAVEATED", "SOUS RÉSERVE"],
    ["cant-claim", "▲", "CAN'T CLAIM", "NON DÉFENDABLE"],
  ])("%s carries shape glyph + EN/FR label (never colour-alone)", (key, glyph, en, fr) => {
    const token = PROOF_STATUS_TOKENS[key as keyof typeof PROOF_STATUS_TOKENS];
    expect(token.glyph).toBe(glyph);
    expect(token.labelEn).toBe(en);
    expect(token.labelFr).toBe(fr);
    // Each status ships ink + fill + border (three distinct hues for ~3:1 borders).
    expect(token.ink).toMatch(/^#[0-9A-F]{6}$/i);
    expect(token.fill).toMatch(/^#[0-9A-F]{6}$/i);
    expect(token.border).toMatch(/^#[0-9A-F]{6}$/i);
  });

  test("longest FR stamp label is NON DÉFENDABLE (no-truncation reference, UX-DR26)", () => {
    const longest = STATUS_ORDER.map((k) => PROOF_STATUS_TOKENS[k].labelFr).sort(
      (a, b) => b.length - a.length,
    )[0];
    expect(longest).toBe("NON DÉFENDABLE");
  });
});

describe("Pending stamp (pre-audit UI state, Story 1.6)", () => {
  test("carries a hollow glyph + EN/FR label, kept off the R/Y/G scale (AD-12)", () => {
    expect(PENDING_TOKEN.glyph).toBe("◯");
    expect(PENDING_TOKEN.labelEn).toBe("PENDING");
    expect(PENDING_TOKEN.labelFr).toBe("EN ATTENTE");
    // Pending is not a Proof Status — it must never appear in STATUS_ORDER.
    expect(STATUS_ORDER as readonly string[]).not.toContain("pending");
  });
});

describe("Provenance vocabulary (UX-DR3)", () => {
  test("machine = slate ✓, human = taupe ❝", () => {
    expect(PROVENANCE_TOKENS.machine.glyph).toBe("✓");
    expect(PROVENANCE_TOKENS.human.glyph).toBe("❝");
  });
});

describe("Provenance vs status are two orthogonal colour systems (AD-3 invariant)", () => {
  test("no provenance colour reuses any status colour", () => {
    const statusHues = new Set(
      STATUS_ORDER.flatMap((k) => {
        const t = PROOF_STATUS_TOKENS[k];
        return [t.ink, t.fill, t.border].map((h) => h.toUpperCase());
      }),
    );
    const provenanceHues = [
      PROVENANCE_TOKENS.machine.ink,
      PROVENANCE_TOKENS.machine.bg,
      PROVENANCE_TOKENS.human.ink,
      PROVENANCE_TOKENS.human.bg,
    ].map((h) => h.toUpperCase());
    for (const hue of provenanceHues) {
      expect(statusHues.has(hue), `${hue} must not collide with a status hue`).toBe(false);
    }
  });
});

describe("Palette single-source-of-truth matches globals.css (drift guard)", () => {
  const css = readFileSync(join(import.meta.dirname, "..", "app", "globals.css"), "utf8");

  test.each(Object.entries(PALETTE))("--%s is declared in globals.css as %s", (name, hex) => {
    // Every canonical palette token must appear as a CSS custom property value.
    const re = new RegExp(`--${name}\\s*:\\s*${hex}\\b`, "i");
    expect(re.test(css), `expected --${name}: ${hex} in globals.css`).toBe(true);
  });

  test("focus-ring token equals the seal hue (UX-DR6 sanctioned use)", () => {
    expect(PALETTE["focus-ring"].toUpperCase()).toBe(PALETTE.seal.toUpperCase());
  });
});
