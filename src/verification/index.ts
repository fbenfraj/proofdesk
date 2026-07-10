// src/verification — the third adapter (AD-2, AD-7, AD-8) and the ONE
// deliberately dangerous edge of the whole system: it is the only code that
// makes outbound HTTP. It owns link-liveness CLASSIFICATION into the four-value
// taxonomy (`live | dead | blocked | unresolved`, AD-7) and it is SSRF-hardened
// (AD-8) — every URL is scheme-checked, DNS-resolved-and-IP-validated BEFORE the
// socket opens, the connection is pinned to that validated IP (closing the
// DNS-rebinding window), redirects are followed manually re-validating each hop,
// and a timeout + response-size cap + bounded concurrency apply.
//
// HONESTY INVARIANTS baked in here, not in copy:
//   - `blocked ≠ dead`. A platform anti-bot 403/challenge is `blocked`, NEVER
//     "proof is gone". `dead` is reserved for authoritative absence
//     (`404`/`410`, `NXDOMAIN`). Only `live` satisfies the reachability gate —
//     but that mapping lives in the pure core (AD-5), off the label only; this
//     adapter never decides "reachable enough for Green".
//   - Every non-`dead` label carries the tagline "link resolves — content not
//     verified" (AD-7): reachability is never content verification.
//   - The optional keyless oEmbed check (YouTube/TikTok only) reports only that a
//     resource "existed at check-time" — never content verification, never a
//     Claim lift.
//
// TESTABILITY (AD-10): the adapter is mockable/off. `checkLiveness` takes
// injectable `resolve`/`request`/`now` deps; the unit suite injects fakes so NO
// real outbound HTTP occurs. Naive hostname/regex filtering is INSUFFICIENT —
// resolve-then-validate-IP-then-pin is mandatory.

import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import type { LivenessLabel } from "@/src/schema";

// --- Tunables (AD-8) -------------------------------------------------------

const TIMEOUT_MS = 8_000;
const DNS_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_REDIRECT_HOPS = 3;
const DEFAULT_CONCURRENCY = 4;
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
const USER_AGENT = "ProofDesk-LinkCheck/1.0 (+liveness; content-not-verified)";

/** Attached to every non-`dead` label (AD-7). Reachability ≠ content proof. */
export const LIVENESS_TAGLINE = "link resolves — content not verified";

// --- Result shape ----------------------------------------------------------

/** One SSRF-hardened liveness check, fully auditable (AD-7). `status` is the raw
 *  HTTP status as text, or NULL when no response was received (DNS/SSRF/transport
 *  failure). `reason` is a stable machine code (e.g. `ssrf-blocked`, `nxdomain`,
 *  `redirect-loop`, `http-404`). `tagline` is the honesty stamp — present on
 *  every non-`dead` label, NULL on `dead`. */
export interface LivenessResult {
  label: LivenessLabel;
  status: string | null;
  finalUrl: string;
  reason: string;
  checkedAt: string;
  tagline: string | null;
}

/** Injectable seams so the adapter is mockable/off in tests (AD-10). */
export interface LivenessDeps {
  /** Resolve a hostname to ALL its A/AAAA addresses (order preserved). */
  resolve: (hostname: string) => Promise<string[]>;
  /** Perform ONE hop pinned to `ip` (no auto-redirect); return status +
   *  `Location`. The real impl connects the socket to `ip` while keeping the
   *  hostname for Host header + TLS SNI — that pin is the rebinding defense. */
  request: (
    url: string,
    ip: string,
    method: "HEAD" | "GET",
  ) => Promise<{ status: number; location: string | null }>;
  /** Server-UTC clock (AD-11) — the shell owns time, never the core. */
  now: () => string;
}

// --- IP guard — resolve-then-validate (AD-8) -------------------------------
//
// Exported for direct unit testing: the SSRF table asserts each of these is
// blocked without any network. IPv4-mapped IPv6 forms delegate to the IPv4
// check so `::ffff:169.254.169.254` cannot slip through.

const IPV4_BLOCKS: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — incl. 169.254.169.254 cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved / broadcast (incl. 255.255.255.255)
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return true; // unparseable → refuse
  for (const [base, bits] of IPV4_BLOCKS) {
    const baseInt = ipv4ToInt(base);
    if (baseInt === null) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((value & mask) === (baseInt & mask)) return true;
  }
  return false;
}

/** Expand an IPv6 literal to its 8 hextets, or null if unparseable. Handles
 *  `::` compression and a trailing embedded IPv4 (`::ffff:1.2.3.4`). */
function expandIpv6(ip: string): number[] | null {
  let head = ip;
  const embeddedV4: number[] = [];
  const lastColon = head.lastIndexOf(":");
  const tail = head.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = ipv4ToInt(tail);
    if (v4 === null) return null;
    embeddedV4.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
    head = head.slice(0, lastColon + 1); // keep the trailing ':'
  }
  const halves = head.split("::");
  if (halves.length > 2) return null;
  const toHextets = (s: string): number[] | null => {
    if (s === "") return [];
    const out: number[] = [];
    for (const group of s.split(":")) {
      if (group === "") continue;
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };
  const left = toHextets(halves[0]);
  const right = halves.length === 2 ? toHextets(halves[1]) : [];
  if (left === null || right === null) return null;
  const known = left.length + right.length + embeddedV4.length;
  if (halves.length === 2) {
    if (known > 8) return null;
    const zeros = new Array(8 - known).fill(0);
    return [...left, ...zeros, ...right, ...embeddedV4];
  }
  const full = [...left, ...right, ...embeddedV4];
  return full.length === 8 ? full : null;
}

function isBlockedIpv6(ip: string): boolean {
  const h = expandIpv6(ip);
  if (h === null) return true; // unparseable → refuse

  // Embedded-IPv4 forms — extract the trailing 32 bits and apply the IPv4 guard,
  // so an internal IPv4 can never tunnel through an IPv6 representation. Covers
  // IPv4-mapped (`::ffff:a.b.c.d`), IPv4-compatible/deprecated (`::a.b.c.d`, which
  // also captures `::` and `::1` → 0.0.0.0/8), and NAT64 (`64:ff9b::/96`).
  const high80Zero = h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0;
  const isV4Mapped = high80Zero && h[5] === 0xffff;
  const isV4Compat = high80Zero && h[5] === 0;
  const isNat64 =
    h[0] === 0x0064 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0;
  if (isV4Mapped || isV4Compat || isNat64) {
    const v4 = `${(h[6] >> 8) & 0xff}.${h[6] & 0xff}.${(h[7] >> 8) & 0xff}.${h[7] & 0xff}`;
    return isBlockedIpv4(v4);
  }

  // 6to4 (`2002::/16`) tunnels an IPv4 in bits 16-48; deprecated — refuse
  // outright rather than trust the embedded address (fail-closed).
  if (h[0] === 0x2002) return true;
  // Documentation range inside global unicast (`2001:db8::/32`).
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true;

  // ALLOWLIST (AD-8, fail-closed): only global unicast `2000::/3` may be reached.
  // Everything else — ULA `fc00::/7`, link-local `fe80::/10`, site-local (deprecated)
  // `fec0::/10`, multicast `ff00::/8`, and all other reserved space — is refused.
  if ((h[0] & 0xe000) !== 0x2000) return true;

  return false;
}

/** True when `ip` is a private/reserved/loopback/link-local address that a
 *  server-side fetch must NEVER connect to (AD-8). Unparseable → blocked. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true; // not an IP literal → refuse
}

// --- Classification (AD-7) — the adapter OWNS this -------------------------

/** Map a raw HTTP status to the four-value taxonomy. `dead` is authoritative
 *  absence only; anti-bot rejections are `blocked`; anything we could not turn
 *  into a confident live/dead is `unresolved` (honest "couldn't be checked"). */
export function classifyStatus(status: number): LivenessLabel {
  if (status === 404 || status === 410) return "dead";
  if (status === 401 || status === 403 || status === 429) return "blocked";
  if (status >= 200 && status < 300) return "live";
  return "unresolved"; // 5xx, other 4xx, 1xx, unexpected 3xx
}

// --- Default (real) deps ---------------------------------------------------

async function defaultResolve(hostname: string): Promise<string[]> {
  const records = await dnsLookup(hostname, { all: true });
  return records.map((r) => r.address);
}

function isNxdomain(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === "ENOTFOUND" || code === "EAI_NONAME" || code === "EAI_NODATA";
}

function transportReason(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code === "ETIMEDOUT" || (err as { name?: string })?.name === "TimeoutError") return "timeout";
  if (code.startsWith("ERR_TLS") || code.startsWith("ERR_SSL") || code.includes("CERT")) {
    return "tls-error";
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EHOSTUNREACH") {
    return "connect-error";
  }
  return "transport-error";
}

class TimeoutError extends Error {
  override name = "TimeoutError";
}

/** Reject with a `TimeoutError` if `p` has not settled within `ms`. Used to
 *  bound DNS resolution (AD-8) — the per-request timeout only starts AFTER the
 *  lookup, so a stalled resolver would otherwise hang past the budget. The timer
 *  is unref'd so it never keeps the process alive. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError("timed out")), ms);
    if (timer && typeof (timer as { unref?: () => void }).unref === "function") {
      (timer as { unref: () => void }).unref();
    }
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** One hop, pinned to `ip`. The `lookup` override is what makes the socket
 *  connect to the pre-validated IP while the hostname still drives Host + TLS
 *  SNI — no re-resolution, so no DNS-rebinding window (AD-8). */
function defaultRequest(
  url: string,
  ip: string,
  method: "HEAD" | "GET",
): Promise<{ status: number; location: string | null }> {
  const u = new URL(url);
  const isHttps = u.protocol === "https:";
  const mod = isHttps ? https : http;
  const family = isIP(ip);
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    const req = mod.request(
      url,
      {
        method,
        // Pin the connection to the validated IP; ignore the hostname so the
        // socket can never be redirected to a re-resolved (rebinding) address.
        lookup: (_hostname, _opts, cb) =>
          (cb as (e: null, addr: string, fam: number) => void)(null, ip, family),
        servername: isHttps ? u.hostname : undefined,
        headers: { host: u.host, "user-agent": USER_AGENT, accept: "*/*" },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_RESPONSE_BYTES) req.destroy(); // response-size cap
        });
        res.on("end", () => done(() => resolve({ status, location })));
        res.on("close", () => done(() => resolve({ status, location })));
        res.on("error", (err) => done(() => reject(err)));
      },
    );
    req.on("timeout", () => req.destroy(new TimeoutError("request timed out")));
    req.on("error", (err) => done(() => reject(err)));
    req.end();
  });
}

// --- The checker -----------------------------------------------------------

function build(
  label: LivenessLabel,
  status: string | null,
  finalUrl: string,
  reason: string,
  now: () => string,
): LivenessResult {
  return {
    label,
    status,
    finalUrl,
    reason,
    checkedAt: now(),
    tagline: label === "dead" ? null : LIVENESS_TAGLINE,
  };
}

/** SSRF-hardened four-value liveness check (AD-7, AD-8). Resolves + validates
 *  every hop's IP before connecting, pins the connection, follows redirects
 *  manually (~3 hops), and classifies the outcome. Never throws on a bad URL or
 *  a network failure — a failure is a labelled `unresolved`/`dead`, auditable
 *  via `status`/`finalUrl`/`reason`. */
export async function checkLiveness(
  rawUrl: string,
  deps: Partial<LivenessDeps> = {},
): Promise<LivenessResult> {
  const resolve = deps.resolve ?? defaultResolve;
  const request = deps.request ?? defaultRequest;
  const now = deps.now ?? (() => new Date().toISOString());

  let currentUrl = rawUrl;
  const visited = new Set<string>();

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    let u: URL;
    try {
      u = new URL(currentUrl);
    } catch {
      return build("unresolved", null, currentUrl, "invalid-url", now);
    }

    // Scheme allow-list — everything but http/https is rejected with NO fetch.
    if (!ALLOWED_SCHEMES.has(u.protocol)) {
      return build("unresolved", null, currentUrl, "scheme-not-allowed", now);
    }

    // Resolve + validate the IP(s) BEFORE connecting (AD-8). For an IPv6 literal
    // URL (`http://[::1]/`), `URL.hostname` keeps the brackets — strip them so
    // both DNS resolution and the IPv6 SSRF guard see the bare address (an
    // unstripped `[::1]` would `ENOTFOUND` and be mis-labelled `dead`).
    const hostname = u.hostname.replace(/^\[/, "").replace(/\]$/, "");
    let addresses: string[];
    try {
      addresses = await withTimeout(resolve(hostname), DNS_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof TimeoutError) {
        return build("unresolved", null, currentUrl, "dns-timeout", now);
      }
      if (isNxdomain(err)) return build("dead", null, currentUrl, "nxdomain", now);
      return build("unresolved", null, currentUrl, "dns-error", now);
    }
    if (addresses.length === 0) return build("dead", null, currentUrl, "nxdomain", now);
    // If ANY resolved address is private/reserved, refuse — a mixed public/
    // private answer is the DNS-rebinding shape (AD-8). Stricter is safer.
    if (addresses.some(isBlockedAddress)) {
      return build("unresolved", null, currentUrl, "ssrf-blocked", now);
    }
    const pinnedIp = addresses[0];

    // One hop, pinned. HEAD first; retry GET only when the method is refused.
    visited.add(u.href);
    let res: { status: number; location: string | null };
    try {
      res = await request(currentUrl, pinnedIp, "HEAD");
      if (res.status === 405 || res.status === 501) {
        res = await request(currentUrl, pinnedIp, "GET");
      }
    } catch (err) {
      return build("unresolved", null, currentUrl, transportReason(err), now);
    }

    // Manual redirect following, re-validating on the next loop iteration.
    if (res.status >= 300 && res.status < 400 && res.location) {
      let next: string;
      try {
        next = new URL(res.location, currentUrl).href;
      } catch {
        return build("unresolved", String(res.status), currentUrl, "bad-redirect", now);
      }
      if (visited.has(next)) {
        return build("unresolved", String(res.status), currentUrl, "redirect-loop", now);
      }
      currentUrl = next;
      continue;
    }

    return build(
      classifyStatus(res.status),
      String(res.status),
      currentUrl,
      `http-${res.status}`,
      now,
    );
  }

  return build("unresolved", null, currentUrl, "too-many-redirects", now);
}

// --- Bounded-concurrency batch (AD-8) --------------------------------------

/** Check many URLs with a bounded number of in-flight connections, so a large
 *  Inbox never opens an unbounded fan-out. Order of results matches input. */
export async function checkLivenessBatch(
  urls: string[],
  deps: Partial<LivenessDeps> = {},
  concurrency = DEFAULT_CONCURRENCY,
): Promise<LivenessResult[]> {
  const results = new Array<LivenessResult>(urls.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      results[index] = await checkLiveness(urls[index], deps);
    }
  };
  const pool = Array.from({ length: Math.min(concurrency, urls.length) }, worker);
  await Promise.all(pool);
  return results;
}

// --- Optional keyless oEmbed existence check (AD-3, honesty) ---------------
//
// YouTube/TikTok ONLY, keyless, through the SAME SSRF-hardened path. It reports
// ONLY that a resource "existed at check-time" — it is NEVER content
// verification and NEVER lifts a Claim. Silently unavailable → null (optional).

const OEMBED_ENDPOINTS: ReadonlyArray<{ test: RegExp; endpoint: (url: string) => string }> = [
  {
    test: /^(www\.|m\.)?(youtube\.com|youtu\.be)$/i,
    endpoint: (url) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  },
  {
    test: /^(www\.|m\.|vm\.)?tiktok\.com$/i,
    endpoint: (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
  },
];

export interface OembedExistence {
  /** ONLY that the resource existed when checked. NOT content verification. */
  existedAtCheckTime: boolean;
  label: "existed at check-time";
  provider: "youtube" | "tiktok";
}

/** Optional existence probe for YouTube/TikTok. Returns null when the URL is not
 *  a supported provider or the probe is unavailable — it is strictly optional
 *  and NEVER feeds any satisfaction path. */
export async function oembedExistence(
  rawUrl: string,
  deps: Partial<LivenessDeps> = {},
): Promise<OembedExistence | null> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const match = OEMBED_ENDPOINTS.find((e) => e.test.test(u.hostname));
  if (!match) return null;
  const provider = /tiktok/i.test(u.hostname) ? "tiktok" : "youtube";
  // Route the oEmbed request through the SAME hardened checker (SSRF applies to
  // it too). A `live` oEmbed endpoint response means the resource existed.
  const result = await checkLiveness(match.endpoint(rawUrl), deps);
  if (result.label !== "live") return null;
  return { existedAtCheckTime: true, label: "existed at check-time", provider };
}
