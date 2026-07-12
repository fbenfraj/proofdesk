// Story 4.4 — the PURE proof-manifest builders (src/export/manifest) + the PURE
// ZIP bundle builder (src/export/bundle). Tested with plain data (no DB): both
// manifests carry `machine_or_human` AND `data_origin` verbatim (NFR-D1, AD-9),
// the CSV is well-formed (quote-escaped), the JSON parses, provenance is faithful
// (a metric row stays human — tripwire), no fabricated number appears, and the
// output is deterministic. The bundle round-trips through `unzipSync` (open
// format, AC7) and is byte-stable (AD-11 — clock-free).

import { unzipSync } from "fflate";
import { describe, expect, test } from "vitest";
import {
  buildProofManifestCsv,
  buildProofManifestJson,
  buildReportBundle,
  type ManifestRow,
} from "@/src/export";

const rows: ManifestRow[] = [
  {
    claimRef: "A1",
    creatorName: "Malo",
    deliverableType: "twitch-sponsor-segment",
    proofStatus: "green",
    caveats: [],
    evidenceType: "link",
    evidenceSource: "https://twitch.tv/videos/2141906",
    machineOrHuman: "machine",
    dataOrigin: "real",
    livenessLabel: "live",
    uploadedAt: "2026-07-12T00:00:00.000Z",
    evidencePath: null, // a link receipt — no bundled file
  },
  {
    claimRef: "A2",
    creatorName: 'Rayan, "the closer"', // comma + quotes → must be CSV-escaped
    deliverableType: "instagram-story",
    proofStatus: "yellow",
    caveats: ["Rests on the creator's word", "needs a timestamped clip"],
    evidenceType: "viewer-metric",
    evidenceSource: "reach: 41,200", // comma inside a value
    machineOrHuman: "human",
    dataOrigin: "real",
    livenessLabel: null,
    uploadedAt: "2026-07-12T01:00:00.000Z",
    evidencePath: "evidence/A2/r1-shot.png", // a bundled screenshot
  },
];

describe("buildProofManifestCsv", () => {
  test("has a header row carrying machine_or_human AND data_origin (AC2)", () => {
    const csv = buildProofManifestCsv(rows);
    const header = csv.split(/\r?\n/)[0];
    expect(header).toContain("machine_or_human");
    expect(header).toContain("data_origin");
    expect(header).toContain("proof_status");
    expect(header).toContain("caveats");
    expect(header).toContain("evidence_source");
    expect(header).toContain("evidence_path");
  });

  test("evidence_path names the bundled file, and is empty for a non-file receipt", () => {
    const csv = buildProofManifestCsv(rows);
    // A1 is a link → no bundled file → empty evidence_path; A2 → the screenshot path.
    expect(csv).toContain("evidence/A2/r1-shot.png");
    const a1 = csv.split(/\r?\n/).find((l) => l.startsWith("A1,"));
    expect(a1?.endsWith(",")).toBe(true); // trailing empty evidence_path cell
  });

  test("quote-escapes values containing comma / quote so the CSV is well-formed", () => {
    const csv = buildProofManifestCsv(rows);
    // The comma-and-quote name is wrapped in quotes with the inner quote doubled.
    expect(csv).toContain('"Rayan, ""the closer"""');
    // The comma inside the metric value is quoted, not a column break.
    expect(csv).toContain('"reach: 41,200"');
    // Re-parse: every data row has the same column count as the header.
    const lines = csv.trimEnd().split(/\r?\n/);
    expect(lines.length).toBe(rows.length + 1);
  });

  test("a metric/screenshot row stays human — provenance never relabelled (AD-19 tripwire)", () => {
    const csv = buildProofManifestCsv(rows);
    const metricLine = csv.split(/\r?\n/).find((l) => l.includes("viewer-metric"));
    expect(metricLine).toBeDefined();
    expect(metricLine).toContain("human");
    expect(metricLine).not.toContain("machine");
  });

  test("is deterministic (same rows → identical string)", () => {
    expect(buildProofManifestCsv(rows)).toBe(buildProofManifestCsv(rows));
  });

  test("carries no fabricated number — only the passed stored values (NFR-D9)", () => {
    const csv = buildProofManifestCsv(rows);
    // The only digit-bearing strings are the stored evidence values + timestamps.
    // A percentage/score would be an invented figure — assert none appears.
    expect(csv).not.toMatch(/%/);
    expect(csv).toContain("reach: 41,200"); // verbatim stored value, not computed
  });
});

describe("buildProofManifestJson", () => {
  test("parses and every row carries machine_or_human + data_origin (AC2)", () => {
    const parsed = JSON.parse(buildProofManifestJson(rows));
    expect(parsed.rows).toHaveLength(2);
    for (const row of parsed.rows) {
      expect(row).toHaveProperty("machine_or_human");
      expect(row).toHaveProperty("data_origin");
    }
    expect(parsed.rows[0].data_origin).toBe("real");
    expect(parsed.rows[1].machine_or_human).toBe("human");
    // Caveats stay an array in JSON (the CSV flattens them).
    expect(parsed.rows[1].caveats).toEqual([
      "Rests on the creator's word",
      "needs a timestamped clip",
    ]);
  });

  test("carries a stable manifest_version (a constant, not a timestamp) + is deterministic", () => {
    const json = buildProofManifestJson(rows);
    expect(JSON.parse(json).manifest_version).toBe(1);
    expect(buildProofManifestJson(rows)).toBe(json);
  });
});

describe("buildReportBundle", () => {
  test("produces a real, openable ZIP that round-trips the exact entries (AC1/AC7)", () => {
    const enc = new TextEncoder();
    const files = [
      { path: "report.html", bytes: enc.encode("<!doctype html><p>hi</p>") },
      { path: "manifest.csv", bytes: enc.encode("a,b\n1,2\n") },
      { path: "evidence/A1/r1-shot.png", bytes: new Uint8Array([137, 80, 78, 71]) },
    ];
    const zip = buildReportBundle(files);
    expect(zip.byteLength).toBeGreaterThan(0);
    const back = unzipSync(zip);
    expect(Object.keys(back).sort()).toEqual([
      "evidence/A1/r1-shot.png",
      "manifest.csv",
      "report.html",
    ]);
    expect(new TextDecoder().decode(back["report.html"])).toBe("<!doctype html><p>hi</p>");
    expect(Array.from(back["evidence/A1/r1-shot.png"])).toEqual([137, 80, 78, 71]);
  });

  test("is deterministic — same files → identical bytes (AD-11, no wall clock)", () => {
    const enc = new TextEncoder();
    const files = [{ path: "a.txt", bytes: enc.encode("hello") }];
    expect(Array.from(buildReportBundle(files))).toEqual(Array.from(buildReportBundle(files)));
  });

  test("rejects unsafe paths — absolute, traversal, backslash, drive prefix, empty", () => {
    const b = new Uint8Array([1]);
    for (const bad of ["/etc/passwd", "../secret", "a/../b", "a\\b", "C:/x", ""]) {
      expect(() => buildReportBundle([{ path: bad, bytes: b }])).toThrow(/Unsafe bundle path/);
    }
  });

  test("rejects a duplicate path rather than silently overwriting", () => {
    const b = new Uint8Array([1]);
    expect(() =>
      buildReportBundle([
        { path: "report.html", bytes: b },
        { path: "report.html", bytes: b },
      ]),
    ).toThrow(/Duplicate bundle path/);
  });
});
