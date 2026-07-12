// /api/campaigns/[campaignId]/report — the Client-Safe Report seam (Story 4.1,
// FR-11, AD-20/AD-21). Route Handlers live at app/api/<resource>/route.ts and
// belong to the shell (AD-2): this one Zod-parses the route param at the boundary
// (AD-8), generates the server `now` HERE (AD-11 — the only clock), and delegates
// all assembly to the report service. It never touches the DB driver or the core.
// Basic-auth (proxy.ts, AD-14) already gates every request.
//
// POST → create a NEW report version frozen against the current evidence snapshot.
// GET  → the latest report's builder view (client-visible + internal-only Red).
// Both responses are wrapped with the shell-composed white-label `branding`
// (agency name/logo + the removable ProofDesk byline, FR-12) — a presentation
// concern the service layer never touches (AD-2).

import { z } from "zod";
import { withReportBranding } from "@/app/_lib/report-branding";
import { getCampaign, getDb } from "@/src/repositories";
import { createReport, getLatestReportBuilderView } from "@/src/services";

const CampaignIdParam = z.object({ campaignId: z.string().min(1) });

export async function POST(
  request: Request,
  ctx: { params: Promise<{ campaignId: string }> },
): Promise<Response> {
  const param = CampaignIdParam.safeParse(await ctx.params);
  if (!param.success) {
    return Response.json({ error: "Invalid campaign id" }, { status: 400 });
  }
  const { db } = getDb();
  // A missing parent Campaign is a clean 404, not a write-time FK 500 — the shell
  // guards existence before the report insert derives data_origin from it (AD-9).
  if (!getCampaign(db, param.data.campaignId)) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }
  // The only clock the freeze ever sees, generated at the shell boundary (AD-11).
  const now = new Date().toISOString();
  const view = createReport(db, param.data.campaignId, now);
  return Response.json(withReportBranding(request, view), { status: 201 });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ campaignId: string }> },
): Promise<Response> {
  const param = CampaignIdParam.safeParse(await ctx.params);
  if (!param.success) {
    return Response.json({ error: "Invalid campaign id" }, { status: 400 });
  }
  const { db } = getDb();
  const view = getLatestReportBuilderView(db, param.data.campaignId);
  if (!view) {
    return Response.json({ error: "No report for this campaign" }, { status: 404 });
  }
  return Response.json(withReportBranding(request, view));
}
