// /api/campaigns/[campaignId]/report/document — serve the self-contained
// Client-Safe Report as a single HTML document (Story 4.3, FR-14, AD-12). GET
// renders the latest report's document (inline styles, base64 screenshots,
// 3-channel status, trust footer) with `Content-Type: text/html`. The Route
// Handler stays thin (AD-2): it Zod-parses the param at the boundary (AD-8),
// resolves the locale from the request cookie (reusing 4.2's malformed-cookie
// safety — a bad cookie never 500s), and delegates all assembly to the shell
// document builder. Basic-auth (proxy.ts, AD-14) already gates every request.
//
// This is the on-screen / preview artifact. The download filename +
// `Content-Disposition: attachment` + `is_demo` export hard-wall + `SAMPLE` badge
// are Story 4.4 — this handler does NOT gate demo campaigns or force a download
// (AD-9 permits the on-screen view for a demo).

import { z } from "zod";
import { localeFromRequest } from "@/app/_lib/report-branding";
import { assembleReportDocumentHtml } from "@/app/_lib/report-document";
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
  const html = await assembleReportDocumentHtml(db, getStorage(), param.data.campaignId, locale);
  if (html === null) {
    return Response.json({ error: "No report for this campaign" }, { status: 404 });
  }
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
