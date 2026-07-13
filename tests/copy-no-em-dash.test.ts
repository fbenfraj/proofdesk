// Owner copy rule (Epic 4 retro, AI-7): user-facing copy carries NO em-dash (-)
// or en-dash (-). Standing preference - use a plain hyphen (-), comma, or colon
// instead. This guard makes the rule unrepresentable in shipped UI: it fails the
// build the moment a dash sneaks back into rendered copy.
//
// Two axes are pinned:
//   1. The i18n catalog (app/_lib/i18n.ts) - the canonical, externalized store of
//      every localized string, static AND function-built. Walked directly so a
//      violation names the exact string.
//   2. Every OTHER string literal in the production source (app/ · src/ · seed/).
//      UI copy is not only in the catalog: the audit-trace `reason` strings from
//      src/core render in the Claim Card drawer, route handlers return error
//      copy, the report renderer builds HTML, etc. Comments legitimately use
//      em-dashes throughout the codebase, so comments are stripped first; any
//      dash that survives is inside a real string/template literal.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { LOCALES, localeStrings } from "@/app/_lib/i18n";

const EM_DASH = "—";
const EN_DASH = "–";
const DASH_RE = /[—–]/;

// The repo root (this file lives in <root>/tests/).
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

/** Collect every renderable string in a catalog: static values AND the STATIC
 *  text of function-built strings (called with placeholder args - only the
 *  template's literal parts, where a stray dash would live, matter here). */
function collectCopy(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
  } else if (typeof value === "function") {
    try {
      // Every catalog function has arity <= 3; empty objects survive both
      // positional interpolation and destructuring without throwing.
      const rendered = (value as (...args: unknown[]) => unknown)({}, {}, {});
      if (typeof rendered === "string") out.push(rendered);
    } catch {
      // Non-resolvable with placeholder args - no such shape exists today.
    }
  } else if (Array.isArray(value)) {
    for (const v of value) collectCopy(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectCopy(v, out);
  }
}

// Strip block comments (also covers the JSX `{block}` form) and line comments.
// No string-state tracking is needed: mistaking a comment-opener inside a string
// (a URL's double-slash) for a comment only skips a dash-free tail, so it can
// never turn a comment into a false positive. Any dash left after stripping is
// inside a real string or template literal.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Recursively collect .ts/.tsx files under top-level production source dirs. */
function collectSourceFiles(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (absDir: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
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

// Production source only - tests/ legitimately reference dashes to guard them.
const SOURCE_FILES = collectSourceFiles(["app", "src", "seed"]);

describe("UI copy carries no em-dash or en-dash (owner preference, Epic 4 retro AI-7)", () => {
  test("every string in the EN and FR i18n catalog is dash-free", () => {
    for (const locale of LOCALES) {
      const copy: string[] = [];
      collectCopy(localeStrings(locale), copy);
      expect(copy.length).toBeGreaterThan(0);
      for (const s of copy) {
        expect(s.includes(EM_DASH), `${locale}: em-dash in ${JSON.stringify(s)}`).toBe(false);
        expect(s.includes(EN_DASH), `${locale}: en-dash in ${JSON.stringify(s)}`).toBe(false);
      }
    }
  });

  test("no string literal in app/src/seed source carries a dash (comments excluded)", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(0);
    for (const file of SOURCE_FILES) {
      const code = stripComments(readFileSync(file, "utf8"));
      const offending = code
        .split("\n")
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(({ line }) => DASH_RE.test(line));
      const rel = file.slice(REPO_ROOT.length);
      expect(
        offending.length,
        `${rel} has a dash in a string literal: ${offending.map((o) => `L${o.n} ${o.line}`).join(" | ")}`,
      ).toBe(0);
    }
  });
});
