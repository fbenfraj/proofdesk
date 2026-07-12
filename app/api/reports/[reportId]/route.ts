// /api/reports/[reportId] — the report branding seam (Story 4.2, FR-12). Route
// Handlers belong to the shell (AD-2): Zod-parse the param + body at the boundary
// (AD-8), resolve the locale from the cookie HERE, delegate to the report service,
// and shape the response. Basic-auth (proxy.ts, AD-14) gates every request.
//
// PATCH { bylineRemoved: boolean } → remove/restore the ProofDesk audit byline for
//   this report version. The byline is present by default and operator-removable;
//   the Proof Appendix always travels regardless (AC4). Unknown report → 404.

import { z } from "zod";
import { withReportBranding } from "@/app/_lib/report-branding";
import { getDb } from "@/src/repositories";
import { setReportByline } from "@/src/services";

const ReportParam = z.object({ reportId: z.string().min(1) });
const PatchBody = z.object({ bylineRemoved: z.boolean() });

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ reportId: string }> },
): Promise<Response> {
  const param = ReportParam.safeParse(await ctx.params);
  if (!param.success) {
    return Response.json({ error: "Invalid report id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = PatchBody.safeParse(raw);
  if (!body.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { db } = getDb();
  const view = setReportByline(db, param.data.reportId, body.data.bylineRemoved);
  if (!view) {
    return Response.json({ error: "Report not found" }, { status: 404 });
  }
  return Response.json(withReportBranding(request, view));
}
