import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyOperator } from "@/src/services/basic-auth";

// AD-14: a single shared operator credential (HTTP Basic) gates the ENTIRE app.
// No OAuth, no JWT, no per-user accounts, no billing anywhere in the codebase.
//
// Next.js 16 renamed the request-gating "middleware" file convention to `proxy`
// (the deprecated `middleware.ts` name is removed in a future major). This proxy
// IS the basic-auth middleware referenced by the story — same request interception,
// current filename.
//
// Credentials come from OPERATOR_USER / OPERATOR_PASSWORD. In non-production they
// fall back to operator/changeme for local convenience; in production nothing is
// assumed — if the env is unset, verifyOperator fails and every request is 401'd
// (closed by default).
function expectedCredentials() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    user: process.env.OPERATOR_USER ?? (isProd ? "" : "operator"),
    pass: process.env.OPERATOR_PASSWORD ?? (isProd ? "" : "changeme"),
  };
}

export function proxy(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (verifyOperator(header, expectedCredentials())) {
    return NextResponse.next();
  }
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ProofDesk", charset="UTF-8"' },
  });
}

// Gate everything except Next internals and static assets. The health route and
// all app routes ARE gated. Static files (_next/static, favicon, etc.) are
// excluded so the 401 challenge page and assets load correctly.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
