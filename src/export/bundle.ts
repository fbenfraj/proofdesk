// src/export/bundle — the PURE ZIP-bytes builder (Story 4.4, FR-14, AD-12,
// NFR-D4). Wraps `fflate.zipSync` into a content-agnostic, deterministic function:
// it knows nothing about reports or evidence — the SHELL (app/_lib/report-export)
// assembles the named byte entries (report.html, evidence/…, manifest.csv,
// manifest.json) and this turns them into an openable, portable ZIP.
//
// PURE + deterministic like the other src/export builders: imports nothing from
// `app/`, does no env/fs/DB/Next access, and stamps a FIXED in-range mtime so the
// bytes are reproducible (no `Date.now()` — that would break determinism/tests
// and the AD-11 clock-free discipline). ZIP is an open format (round-trippable
// with any unzip tool) — the "no lock-in" guarantee (NFR-D4).

import { zipSync } from "fflate";

/** One entry in the bundle: a forward-slashed path and its raw bytes. */
export interface BundleFile {
  path: string;
  bytes: Uint8Array;
}

/** ZIP's DOS-date epoch is 1980-01-01 (values before it are out of range). We
 *  stamp every entry with this fixed instant so the bundle bytes are fully
 *  deterministic — reproducible and testable, never a wall-clock leak (AD-11). */
const FIXED_MTIME = Date.UTC(1980, 0, 1);

/** Reject paths that could escape the archive or silently collide — the same
 *  defense-in-depth posture as the storage adapter's `assertSafeKey`. The exported
 *  builder guards its own contract: today's caller paths are shell-controlled, but
 *  a future caller must not be able to write an absolute / traversing / duplicate
 *  entry (Codex review). Keys are portable forward-slashed relative paths. */
function assertSafeBundlePath(path: string): void {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /^[a-zA-Z]:/.test(path) || // drive prefix (C:…)
    path.split("/").some((seg) => seg === "." || seg === "..")
  ) {
    throw new Error(`Unsafe bundle path rejected: ${JSON.stringify(path)}`);
  }
}

/** Build a deterministic, openable ZIP from named byte entries. Same files (same
 *  paths + bytes, same order) → identical archive bytes. Rejects unsafe or
 *  duplicate paths rather than silently overwriting a colliding entry. */
export function buildReportBundle(files: BundleFile[]): Uint8Array {
  const entries: Record<string, [Uint8Array, { mtime: number }]> = {};
  for (const file of files) {
    assertSafeBundlePath(file.path);
    if (file.path in entries) {
      throw new Error(`Duplicate bundle path rejected: ${JSON.stringify(file.path)}`);
    }
    entries[file.path] = [file.bytes, { mtime: FIXED_MTIME }];
  }
  return zipSync(entries);
}
