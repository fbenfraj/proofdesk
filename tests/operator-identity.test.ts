// The server-resolved operator identity (Story 1.9). Attribution ("by [operator]
// · [agency]") and the `authored_by` stamped on every HumanOverride / Caveat come
// from HERE — the shell, never the request body — so a client can never forge who
// authored a decision (integrity, mirrors the server clock of AD-11). Single
// shared operator credential (AD-14): this resolves a DISPLAY identity, not auth.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolveOperatorIdentity } from "@/src/services/operator-identity";

const KEYS = ["OPERATOR_NAME", "OPERATOR_AGENCY", "OPERATOR_USER"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveOperatorIdentity (Story 1.9)", () => {
  test("prefers OPERATOR_NAME / OPERATOR_AGENCY when set", () => {
    process.env.OPERATOR_NAME = "Farouk";
    process.env.OPERATOR_AGENCY = "Frajtech";
    expect(resolveOperatorIdentity()).toEqual({ operator: "Farouk", agency: "Frajtech" });
  });

  test("falls back to OPERATOR_USER for the operator name", () => {
    process.env.OPERATOR_USER = "operator";
    expect(resolveOperatorIdentity().operator).toBe("operator");
  });

  test("has safe defaults when nothing is set (closed-by-default is auth's job, not this)", () => {
    const id = resolveOperatorIdentity();
    expect(id.operator).toBe("operator");
    expect(id.agency).toBe("ProofDesk");
  });

  test("trims blank env values rather than stamping an empty author", () => {
    process.env.OPERATOR_NAME = "   ";
    process.env.OPERATOR_AGENCY = "";
    const id = resolveOperatorIdentity();
    expect(id.operator).toBe("operator");
    expect(id.agency).toBe("ProofDesk");
  });
});
