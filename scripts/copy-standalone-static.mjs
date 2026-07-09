// Postbuild: mirror the client static assets into the standalone output.
//
// `next build` with output:'standalone' does NOT copy `.next/static` or
// `public/` into `.next/standalone` — the deployer must (Next docs). Doing it
// here, at build time, means the standalone artifact is complete before any
// server boots: `node .next/standalone/server.js` then serves the client bundle
// (so pages hydrate) with no test-time filesystem race.
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const pairs = [
  [".next/static", ".next/standalone/.next/static"],
  ["public", ".next/standalone/public"],
];

for (const [src, dest] of pairs) {
  const from = path.resolve(root, src);
  const to = path.resolve(root, dest);
  if (existsSync(from)) {
    // Clear first so the mirror exactly matches this build (no prior chunks).
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
    console.log(`[postbuild] mirrored ${src} -> ${dest}`);
  }
}
