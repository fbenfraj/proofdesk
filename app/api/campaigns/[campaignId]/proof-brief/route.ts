// /api/campaigns/[campaignId]/proof-brief — read the whole Proof Brief for a
// Campaign (Story 3.2, FR-3). Route Handler, shell layer (AD-2): Zod-parses the
// param at the boundary (AD-8), delegates to the proof-brief service, 404s on an
// unknown Campaign. Read-only; the page renders this server-side, and clients may
// re-fetch it after a mutation.
//
// GET → { campaignId, deliverables[], templates[] }

import { z } from "zod";
import { getDb } from "@/src/repositories";
import { getProofBrief } from "@/src/services";

const CampaignIdParam = z.object({ campaignId: z.string().min(1) });

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ campaignId: string }> },
): Promise<Response> {
  const param = CampaignIdParam.safeParse(await ctx.params);
  if (!param.success) {
    return Response.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  const { db } = getDb();
  const view = getProofBrief(db, param.data.campaignId);
  if (!view) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }
  return Response.json(view);
}
