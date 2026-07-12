// Story 4.1 — the PURE report-inclusion resolver (AD-21). This is the ONE place
// `effective_inclusion = inclusion_override ?? default_from_status` lives, so it
// gets an exhaustive, DB-free truth table. Audience is DERIVED here, never stored
// (Epic-3 retro AI-3).

import { describe, expect, test } from "vitest";
import { audienceOf, defaultInclusionFromStatus, resolveReportInclusion } from "@/src/export";
import type { ProofStatus, ReportInclusion, ReportInclusionOverride } from "@/src/schema";

describe("defaultInclusionFromStatus — status → default inclusion (AD-21)", () => {
  test.each([
    ["green", "included"],
    ["yellow", "included-with-caveat"],
    ["red", "excluded-from-client"],
  ] as [ProofStatus, ReportInclusion][])("%s → %s", (status, expected) => {
    expect(defaultInclusionFromStatus(status)).toBe(expected);
  });
});

describe("audienceOf — only excluded is internal_only (AD-21)", () => {
  test("excluded-from-client → internal_only", () => {
    expect(audienceOf("excluded-from-client")).toBe("internal_only");
  });
  test.each([
    "included",
    "included-with-caveat",
  ] as ReportInclusion[])("%s → client_visible", (inclusion) => {
    expect(audienceOf(inclusion)).toBe("client_visible");
  });
});

describe("resolveReportInclusion — override ?? default, exhaustive matrix (AD-21)", () => {
  // status × override → { inclusion, audience }
  const cases: [ProofStatus, ReportInclusionOverride | null, ReportInclusion, string][] = [
    // No override → the status default.
    ["green", null, "included", "client_visible"],
    ["yellow", null, "included-with-caveat", "client_visible"],
    ["red", null, "excluded-from-client", "internal_only"],
    // Override "excluded" → always excluded-from-client, regardless of status.
    ["green", "excluded", "excluded-from-client", "internal_only"],
    ["yellow", "excluded", "excluded-from-client", "internal_only"],
    ["red", "excluded", "excluded-from-client", "internal_only"],
    // Override "included" → included, EXCEPT a Yellow stays caveated.
    ["green", "included", "included", "client_visible"],
    ["yellow", "included", "included-with-caveat", "client_visible"],
    ["red", "included", "included", "client_visible"],
  ];

  test.each(cases)("%s + override=%s → %s / %s", (status, override, inclusion, audience) => {
    const r = resolveReportInclusion(status, override);
    expect(r.inclusion).toBe(inclusion);
    expect(r.audience).toBe(audience);
  });

  test("a force-included Yellow is never shown without its caveat", () => {
    expect(resolveReportInclusion("yellow", "included").inclusion).toBe("included-with-caveat");
  });
});
