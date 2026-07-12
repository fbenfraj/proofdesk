import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  FONT_FAMILY_VARS,
  PALETTE,
  PENDING_TOKEN,
  PROOF_STATUS_TOKENS,
  PROVENANCE_TOKENS,
  RADIUS,
  SHELL_DIMS,
  SPACING,
  STATUS_ORDER,
  TYPE_SCALE,
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

// GATE c/3 (Story 3.3): the drift guard extends beyond colour to the spacing,
// radius, shell-dimension and type-scale tokens, AND flags orphan CSS vars — a
// `--token` declared in globals.css `:root` with no canonical JS mirror. This is
// what stops design decisions from silently diverging across the two files.
describe("Non-colour token single-source-of-truth matches globals.css (GATE c/3)", () => {
  const css = readFileSync(join(import.meta.dirname, "..", "app", "globals.css"), "utf8");

  // Parse the FIRST `:root { ... }` block into a name → value map.
  const rootBlock = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
  const declaredVars = new Map<string, string>();
  for (const m of rootBlock.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    declaredVars.set(m[1], normalize(m[2]));
  }

  function normalize(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
  }

  const nonColourGroups: [string, Record<string, string>][] = [
    ["spacing", SPACING],
    ["radius", RADIUS],
    ["shell-dimension", SHELL_DIMS],
    ["type-scale", TYPE_SCALE],
  ];

  for (const [group, tokens] of nonColourGroups) {
    test.each(Object.entries(tokens))(`${group} --%s is declared as "%s"`, (name, value) => {
      expect(declaredVars.has(name), `--${name} must be declared in globals.css :root`).toBe(true);
      expect(declaredVars.get(name)).toBe(normalize(value));
    });
  }

  test("no orphan CSS var — every :root token has a canonical JS mirror", () => {
    const canonical = new Set<string>([
      ...Object.keys(PALETTE),
      ...Object.keys(SPACING),
      ...Object.keys(RADIUS),
      ...Object.keys(SHELL_DIMS),
      ...Object.keys(TYPE_SCALE),
      ...FONT_FAMILY_VARS,
    ]);
    const orphans = [...declaredVars.keys()].filter((name) => !canonical.has(name));
    expect(orphans, `orphan CSS vars in globals.css :root: ${orphans.join(", ")}`).toEqual([]);
  });

  test("the :root parser actually found the token block (guards a silent no-op)", () => {
    // A regression tripwire: if the parse breaks, the drift/orphan tests would
    // vacuously pass. Assert we parsed a plausible number of vars.
    expect(declaredVars.size).toBeGreaterThanOrEqual(
      Object.keys(PALETTE).length + Object.keys(SPACING).length,
    );
  });
});
