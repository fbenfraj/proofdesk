import { describe, expect, test } from "vitest";
import { parseBasicAuth, safeEqual, verifyOperator } from "@/src/services/basic-auth";

const encode = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

const EXPECTED = { user: "operator", pass: "s3cret:pass" };

describe("verifyOperator (single-operator basic auth, AD-14)", () => {
  test.each([
    ["valid operator credential", encode("operator", "s3cret:pass"), true],
    ["wrong password", encode("operator", "nope"), false],
    ["wrong user", encode("intruder", "s3cret:pass"), false],
    ["empty header", null, false],
    ["missing header (undefined)", undefined, false],
    ["non-basic scheme (Bearer)", "Bearer sometoken", false],
    ["malformed base64", "Basic !!!notbase64!!!", false],
    ["no colon in decoded payload", `Basic ${btoa("operatoronly")}`, false],
    ["password containing colons is preserved", encode("operator", "s3cret:pass"), true],
  ])("%s", (_name, header, expected) => {
    expect(verifyOperator(header, EXPECTED)).toBe(expected);
  });

  test("rejects when expected credential is not configured (closed by default)", () => {
    expect(verifyOperator(encode("operator", "s3cret:pass"), { user: "", pass: "" })).toBe(false);
  });
});

describe("parseBasicAuth", () => {
  test("splits on the first colon so passwords may contain colons", () => {
    expect(parseBasicAuth(encode("u", "a:b:c"))).toEqual({ user: "u", pass: "a:b:c" });
  });

  test("returns null for a header without a scheme", () => {
    expect(parseBasicAuth("justtext")).toBeNull();
  });
});

describe("safeEqual", () => {
  test.each([
    ["equal strings", "abc", "abc", true],
    ["different content, same length", "abc", "abd", false],
    ["different length", "abc", "abcd", false],
    ["both empty", "", "", true],
  ])("%s", (_name, a, b, expected) => {
    expect(safeEqual(a, b)).toBe(expected);
  });
});
