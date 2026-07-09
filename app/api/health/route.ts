// Route Handlers live at app/api/<resource>/route.ts and belong to the shell
// (AD-2). This health check is the one concrete handler in Phase 0 — it proves
// the API surface boots and gives the smoke test a stable endpoint. It touches
// no DB driver, filesystem, or outbound HTTP (those are the repository / storage
// / verification adapters, built later).
export function GET() {
  return Response.json({ status: "ok" });
}
