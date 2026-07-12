// /api/campaigns/[campaignId]/report/download — serve the portable Client-Safe
// Report as a downloadable ZIP bundle (Story 4.4, FR-14, AD-9/AD-12). GET builds
// the bundle (report HTML + evidence files + CSV/JSON manifests) and returns it
// as an `application/zip` attachment. The Route Handler stays thin (AD-2): it
// Zod-parses the param at the boundary (AD-8), resolves the locale from the
// request cookie (reusing 4.2's malformed-cookie safety — a bad cookie never
// 500s), and delegates all assembly + policy to the shell export builder, which
// maps each honest state to a status:
//
//   ok    → 200 application/zip attachment (a real download).
//   demo  → 403 — the is_demo EXPORT HARD-WALL (AD-9): a seeded demo can never be
//           downloaded as a clean client bundle. The on-screen SAMPLE view is all
//           a demo may produce (the `report/document` route).
//   stale → 409 — recompute-or-refuse; regenerate before export (AI-3).
//   none  → 404 — no report for this campaign.
//
// Basic-auth (proxy.ts, AD-14) already gates every request.

import { z } from "zod";
import { localeFromRequest } from "@/app/_lib/report-branding";
import { buildReportDownload } from "@/app/_lib/report-export";
import { getDb } from "@/src/repositories";
import { getStorage } from "@/src/storage";

const CampaignIdParam = z.object({ campaignId: z.string().min(1) });

export async function GET(
  request: Request,
  ctx: { params: Promise<{ campaignId: string }> },
): Promise<Response> {
  const param = CampaignIdParam.safeParse(await ctx.params);
  if (!param.success) {
    return Response.json({ error: "Invalid campaign id" }, { status: 400 });
  }
  const { db } = getDb();
  const locale = localeFromRequest(request);
  const result = await buildReportDownload(db, getStorage(), param.data.campaignId, locale);

  // The bundle (and even the error envelopes) concern a specific client's evidence
  // — never let a browser/proxy cache them (Codex review). `private` keeps a shared
  // proxy from storing it; `no-store` keeps the browser from writing it to disk.
  const NO_STORE = "no-store, private";

  switch (result.kind) {
    case "demo":
      return Response.json(
        { error: "Export is disabled for a demo campaign (SAMPLE only)" },
        { status: 403, headers: { "Cache-Control": NO_STORE } },
      );
    case "stale":
      return Response.json(
        { error: "Report is stale — regenerate it before exporting" },
        { status: 409, headers: { "Cache-Control": NO_STORE } },
      );
    case "none":
      return Response.json(
        { error: "No report for this campaign" },
        { status: 404, headers: { "Cache-Control": NO_STORE } },
      );
    case "ok":
      return new Response(result.bytes as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${result.filename}"`,
          "Cache-Control": NO_STORE,
        },
      });
  }
}
