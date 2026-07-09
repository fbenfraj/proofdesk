// Pure HTTP Basic auth helpers for the single-operator credential (AD-14).
// No OAuth, no JWT, no sessions, no per-user accounts — a single shared operator
// credential is the whole auth surface. These functions are effect-free and use
// only Web-standard APIs (atob) so they run on the Edge (middleware) runtime.

export interface BasicCredentials {
  user: string;
  pass: string;
}

/**
 * Parse an `Authorization: Basic <base64(user:pass)>` header.
 * Returns null for any missing/malformed header rather than throwing.
 */
export function parseBasicAuth(header: string | null | undefined): BasicCredentials | null {
  if (!header) return null;
  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return null;

  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }

  // Split on the FIRST colon only — passwords may legitimately contain ":".
  const sep = decoded.indexOf(":");
  if (sep === -1) return null;
  return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
}

/**
 * Length-independent constant-time-ish string comparison. Avoids leaking match
 * position or length via early return. Not a substitute for a hardened crypto
 * primitive, but adequate for gating a single shared operator credential.
 */
export function safeEqual(a: string, b: string): boolean {
  let mismatch = a.length === b.length ? 0 : 1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Verify an Authorization header against the expected operator credential.
 * If the expected user or password is empty/unset, verification always fails —
 * the app is closed by default until the operator credential is configured.
 */
export function verifyOperator(
  header: string | null | undefined,
  expected: BasicCredentials,
): boolean {
  if (!expected.user || !expected.pass) return false;
  const provided = parseBasicAuth(header);
  if (!provided) return false;
  // Evaluate both comparisons (no short-circuit) to keep timing uniform.
  const userOk = safeEqual(provided.user, expected.user);
  const passOk = safeEqual(provided.pass, expected.pass);
  return userOk && passOk;
}
