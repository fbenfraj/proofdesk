// SSRF-hardened link-liveness adapter (Story 2.4, AD-7/AD-8). This is the one
// deliberately dangerous edge, so the suite is deliberately paranoid:
//   - the SSRF rejection table is NON-OPTIONAL (private IPs, 169.254.169.254,
//     redirect-to-internal, DNS-rebinding shape, non-http schemes);
//   - the four-value classification table proves `blocked ≠ dead`;
//   - NO real outbound HTTP occurs — `resolve`/`request` are injected fakes, and
//     for every SSRF case the `request` fake THROWS if called, proving the IP is
//     validated BEFORE any socket opens (resolve-then-validate-before-connect);
//   - the honesty tagline rides every non-`dead` label;
//   - the optional oEmbed check reports only "existed at check-time".
//
// A companion AD-18 regression (a liveness re-check never touches a
// HumanConfirmation) lives in verification-liveness-writer.test.ts.

import { describe, expect, test, vi } from "vitest";
import {
  checkLiveness,
  checkLivenessBatch,
  classifyStatus,
  isBlockedAddress,
  LIVENESS_TAGLINE,
  oembedExistence,
} from "@/src/verification";

const FIXED_NOW = "2026-07-10T12:00:00.000Z";

/** A `request` fake that must NEVER be called — used for SSRF cases to prove the
 *  adapter refuses before it ever tries to connect. */
const requestMustNotBeCalled = () => {
  throw new Error("request() was called — an SSRF check connected before validating the IP");
};

/** A fixed-response `request` fake (no network). */
const requestReturning =
  (status: number, location: string | null = null) =>
  async () => ({ status, location });

// --- IP guard --------------------------------------------------------------

describe("isBlockedAddress — the SSRF IP guard (AD-8)", () => {
  test.each([
    ["10.0.0.1", true], // private
    ["172.16.5.4", true], // private
    ["172.31.255.255", true], // private (top of /12)
    ["192.168.1.1", true], // private
    ["127.0.0.1", true], // loopback
    ["169.254.169.254", true], // cloud metadata — the headline SSRF target
    ["169.254.0.1", true], // link-local
    ["100.64.0.1", true], // CGNAT
    ["0.0.0.0", true], // "this" network
    ["255.255.255.255", true], // broadcast
    ["::1", true], // IPv6 loopback
    ["::", true], // IPv6 unspecified
    ["fc00::1", true], // ULA
    ["fd12:3456::1", true], // ULA
    ["fe80::1", true], // link-local
    ["::ffff:169.254.169.254", true], // IPv4-mapped metadata address
    ["::ffff:10.0.0.1", true], // IPv4-mapped private
    ["::10.0.0.1", true], // IPv4-compatible (deprecated) — internal IPv4 tunnel
    ["::127.0.0.1", true], // IPv4-compatible loopback
    ["64:ff9b::10.0.0.1", true], // NAT64 embedding an internal IPv4
    ["fec0::1", true], // site-local (deprecated) — was a guard gap
    ["2002:0a00:0001::", true], // 6to4 (deprecated) — refused outright
    ["2001:db8::1", true], // documentation range
    ["fc00::1234:5678", true], // ULA
    ["not-an-ip", true], // unparseable → refuse
    ["93.184.216.34", false], // public (example.com)
    ["8.8.8.8", false], // public
    ["2606:2800:220:1:248:1893:25c8:1946", false], // public IPv6 (global unicast)
    ["2001:4860:4860::8888", false], // public IPv6 (Google DNS) — not the doc range
    ["::ffff:93.184.216.34", false], // IPv4-mapped PUBLIC address is reachable
  ])("%s → blocked=%s", (ip, blocked) => {
    expect(isBlockedAddress(ip)).toBe(blocked);
  });
});

// --- Classification table (blocked ≠ dead) ---------------------------------

describe("classifyStatus — four-value taxonomy (AD-7)", () => {
  test.each([
    [200, "live"],
    [204, "live"],
    [301, "unresolved"], // a dangling 3xx with no followed target
    [401, "blocked"],
    [403, "blocked"], // anti-bot — NEVER dead
    [429, "blocked"], // rate limited — NEVER dead
    [404, "dead"], // authoritative absence
    [410, "dead"], // authoritative absence
    [500, "unresolved"],
    [503, "unresolved"],
    [418, "unresolved"], // other 4xx → couldn't verify, not "gone"
  ])("HTTP %i → %s", (status, label) => {
    expect(classifyStatus(status)).toBe(label);
  });
});

// --- SSRF rejection table (NON-OPTIONAL) -----------------------------------

describe("checkLiveness — SSRF rejections happen BEFORE any connect (AD-8)", () => {
  test.each([
    ["http://10.0.0.1/x", ["10.0.0.1"]],
    ["http://169.254.169.254/latest/meta-data/", ["169.254.169.254"]],
    ["http://internal.test/", ["192.168.0.10"]],
    ["https://metadata.example/", ["::1"]],
  ])("private target %s is unresolved+ssrf-blocked and never connected", async (url, ips) => {
    const result = await checkLiveness(url, {
      resolve: async () => ips,
      request: requestMustNotBeCalled,
      now: () => FIXED_NOW,
    });
    expect(result.label).toBe("unresolved");
    expect(result.reason).toBe("ssrf-blocked");
    expect(result.tagline).toBe(LIVENESS_TAGLINE); // non-dead carries the tagline
  });

  test("DNS-rebinding shape (public + private in one answer) is rejected", async () => {
    const result = await checkLiveness("http://rebind.test/", {
      resolve: async () => ["93.184.216.34", "169.254.169.254"],
      request: requestMustNotBeCalled,
      now: () => FIXED_NOW,
    });
    expect(result.label).toBe("unresolved");
    expect(result.reason).toBe("ssrf-blocked");
  });

  test("redirect to an internal address is re-validated and rejected", async () => {
    // Hop 1: public host, 302 → http://169.254.169.254/. Hop 2 resolves the
    // literal internal IP and must be refused before connecting.
    const resolve = async (host: string) =>
      host === "169.254.169.254" ? ["169.254.169.254"] : ["93.184.216.34"];
    let hop = 0;
    const request = async () => {
      hop += 1;
      if (hop === 1) return { status: 302, location: "http://169.254.169.254/latest/" };
      throw new Error("connected to the internal redirect target");
    };
    const result = await checkLiveness("https://public.test/go", {
      resolve,
      request,
      now: () => FIXED_NOW,
    });
    expect(result.label).toBe("unresolved");
    expect(result.reason).toBe("ssrf-blocked");
  });

  test.each([
    "file:///etc/passwd",
    "ftp://internal.test/x",
    "gopher://internal.test/",
    "data:text/plain,hi",
  ])("non-http(s) scheme %s is rejected with no fetch", async (url) => {
    const result = await checkLiveness(url, {
      resolve: async () => {
        throw new Error("resolve() was called for a disallowed scheme");
      },
      request: requestMustNotBeCalled,
      now: () => FIXED_NOW,
    });
    expect(result.label).toBe("unresolved");
    expect(result.reason).toBe("scheme-not-allowed");
  });

  test("an IPv6-literal URL is unbracketed, so the loopback guard fires (not false-dead)", async () => {
    // `URL.hostname` for `http://[::1]/` is `[::1]` — the checker must strip the
    // brackets before resolving so the IPv6 SSRF guard sees `::1` (a bracketed
    // host would ENOTFOUND and be mis-labelled dead/nxdomain). `resolve` echoes
    // the (already-bare) host, mimicking dns.lookup on a literal.
    let seenHost = "";
    const result = await checkLiveness("http://[::1]/x", {
      resolve: async (host) => {
        seenHost = host;
        return [host];
      },
      request: requestMustNotBeCalled,
      now: () => FIXED_NOW,
    });
    expect(seenHost).toBe("::1"); // brackets stripped
    expect(result.label).toBe("unresolved");
    expect(result.reason).toBe("ssrf-blocked"); // NOT dead/nxdomain
  });
});

describe("checkLiveness — a public IPv6 literal is reachable, not false-dead", () => {
  test("https://[2606:...]/ resolves the bare literal and connects", async () => {
    let seenHost = "";
    const result = await checkLiveness("https://[2606:2800:220:1:248:1893:25c8:1946]/p", {
      resolve: async (host) => {
        seenHost = host;
        return [host];
      },
      request: requestReturning(200),
      now: () => FIXED_NOW,
    });
    expect(seenHost).toBe("2606:2800:220:1:248:1893:25c8:1946"); // no brackets
    expect(result.label).toBe("live");
  });
});

// --- Classification through the full checker (public target) ---------------

describe("checkLiveness — labels a reachable public target (AD-7)", () => {
  const publicResolve = async () => ["93.184.216.34"];

  test("200 → live, with the honesty tagline and audit trail", async () => {
    const result = await checkLiveness("https://example.com/post", {
      resolve: publicResolve,
      request: requestReturning(200),
      now: () => FIXED_NOW,
    });
    expect(result).toMatchObject({
      label: "live",
      status: "200",
      finalUrl: "https://example.com/post",
      reason: "http-200",
      checkedAt: FIXED_NOW,
      tagline: LIVENESS_TAGLINE,
    });
  });

  test("404 → dead, and dead carries NO tagline (nothing resolved)", async () => {
    const result = await checkLiveness("https://example.com/gone", {
      resolve: publicResolve,
      request: requestReturning(404),
      now: () => FIXED_NOW,
    });
    expect(result.label).toBe("dead");
    expect(result.tagline).toBeNull();
    expect(result.status).toBe("404");
  });

  test("403 → blocked (anti-bot is NEVER 'proof is gone')", async () => {
    const result = await checkLiveness("https://example.com/guarded", {
      resolve: publicResolve,
      request: requestReturning(403),
      now: () => FIXED_NOW,
    });
    expect(result.label).toBe("blocked");
    expect(result.tagline).toBe(LIVENESS_TAGLINE);
  });

  test("500 → unresolved", async () => {
    const result = await checkLiveness("https://example.com/boom", {
      resolve: publicResolve,
      request: requestReturning(500),
      now: () => FIXED_NOW,
    });
    expect(result.label).toBe("unresolved");
  });

  test("HEAD 405 falls back to GET", async () => {
    let call = 0;
    const request = async (_url: string, _ip: string, method: "HEAD" | "GET") => {
      call += 1;
      if (method === "HEAD") return { status: 405, location: null };
      return { status: 200, location: null };
    };
    const result = await checkLiveness("https://example.com/head-averse", {
      resolve: publicResolve,
      request,
      now: () => FIXED_NOW,
    });
    expect(call).toBe(2);
    expect(result.label).toBe("live");
  });

  test("follows a public→public redirect and updates finalUrl", async () => {
    const resolve = async () => ["93.184.216.34"];
    let hop = 0;
    const request = async () => {
      hop += 1;
      if (hop === 1) return { status: 301, location: "https://example.com/final" };
      return { status: 200, location: null };
    };
    const result = await checkLiveness("https://example.com/start", {
      resolve,
      request,
      now: () => FIXED_NOW,
    });
    expect(result.label).toBe("live");
    expect(result.finalUrl).toBe("https://example.com/final");
  });

  test("a redirect loop is unresolved, not an infinite hang", async () => {
    const request = async () => ({ status: 302, location: "https://example.com/a" });
    const result = await checkLiveness("https://example.com/a", {
      resolve: async () => ["93.184.216.34"],
      request,
      now: () => FIXED_NOW,
    });
    expect(result.label).toBe("unresolved");
    expect(["redirect-loop", "too-many-redirects"]).toContain(result.reason);
  });

  test("NXDOMAIN → dead (authoritative absence)", async () => {
    const result = await checkLiveness("https://no-such-host.test/", {
      resolve: async () => {
        const err = new Error("getaddrinfo ENOTFOUND") as Error & { code: string };
        err.code = "ENOTFOUND";
        throw err;
      },
      request: requestMustNotBeCalled,
      now: () => FIXED_NOW,
    });
    expect(result.label).toBe("dead");
    expect(result.reason).toBe("nxdomain");
  });

  test("a stalled DNS lookup times out → unresolved/dns-timeout (never hangs)", async () => {
    // A resolver that never settles must not tie up the route past the DNS
    // budget — the checker bounds it and returns unresolved (AD-8). Fake timers
    // keep the test instant.
    vi.useFakeTimers();
    try {
      const pending = checkLiveness("https://slow-dns.test/", {
        resolve: () => new Promise<string[]>(() => {}), // never resolves
        request: requestMustNotBeCalled,
        now: () => FIXED_NOW,
      });
      await vi.advanceTimersByTimeAsync(6_000);
      const result = await pending;
      expect(result.label).toBe("unresolved");
      expect(result.reason).toBe("dns-timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  test("a transport timeout → unresolved (never dead)", async () => {
    const result = await checkLiveness("https://slow.test/", {
      resolve: async () => ["93.184.216.34"],
      request: async () => {
        const err = new Error("timed out") as Error & { code: string };
        err.code = "ETIMEDOUT";
        throw err;
      },
      now: () => FIXED_NOW,
    });
    expect(result.label).toBe("unresolved");
    expect(result.reason).toBe("timeout");
  });
});

// --- Bounded batch ---------------------------------------------------------

describe("checkLivenessBatch — bounded concurrency (AD-8)", () => {
  test("checks every url and preserves order", async () => {
    const urls = ["https://a.test/", "https://b.test/", "https://c.test/"];
    const results = await checkLivenessBatch(
      urls,
      {
        resolve: async () => ["93.184.216.34"],
        request: requestReturning(200),
        now: () => FIXED_NOW,
      },
      2,
    );
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.label === "live")).toBe(true);
    expect(results.map((r) => r.finalUrl)).toEqual(urls);
  });
});

// --- Optional oEmbed existence check (honesty) -----------------------------

describe("oembedExistence — keyless YT/TikTok, 'existed at check-time' only (AD-3)", () => {
  test("a reachable YouTube oEmbed reports existed-at-check-time, never content", async () => {
    const result = await oembedExistence("https://www.youtube.com/watch?v=abc123", {
      resolve: async () => ["93.184.216.34"],
      request: requestReturning(200),
      now: () => FIXED_NOW,
    });
    expect(result).toEqual({
      existedAtCheckTime: true,
      label: "existed at check-time",
      provider: "youtube",
    });
  });

  test("TikTok is supported", async () => {
    const result = await oembedExistence("https://www.tiktok.com/@u/video/1", {
      resolve: async () => ["93.184.216.34"],
      request: requestReturning(200),
      now: () => FIXED_NOW,
    });
    expect(result?.provider).toBe("tiktok");
  });

  test("a non-provider URL returns null (optional, no guess)", async () => {
    const result = await oembedExistence("https://example.com/x", {
      resolve: async () => ["93.184.216.34"],
      request: requestReturning(200),
      now: () => FIXED_NOW,
    });
    expect(result).toBeNull();
  });

  test("an unreachable oEmbed endpoint returns null (silently unavailable)", async () => {
    const result = await oembedExistence("https://youtu.be/abc", {
      resolve: async () => ["93.184.216.34"],
      request: requestReturning(404),
      now: () => FIXED_NOW,
    });
    expect(result).toBeNull();
  });
});
