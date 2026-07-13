// POST /api/campaigns/[campaignId]/deliverables - add one Board item live
// (Story AI-12). A thin shell (AD-2): Zod-validate the body at the boundary
// (AD-8), then delegate to addDeliverableItem, which resolves-or-creates the
// creator and writes the deliverable + its 1:1 Claim. The new claim carries no
// verdict (AD-4/AD-6); origin inherits from the campaign (AD-9). An unknown
// campaign is a clean 404.
//
// POST application/json {
//   creator: { id } | { name, handle? }, type, platformUrl?
// } -> 201 { deliverableId, claimId, creatorId }

import { z } from "zod";
import { getDb } from "@/src/repositories";
import { addDeliverableItem } from "@/src/services";

const Body = z.object({
  creator: z.union([
    z.object({ id: z.string().min(1) }),
    z.object({
      name: z.string().trim().min(1).max(120),
      handle: z.string().trim().max(120).optional(),
    }),
  ]),
  type: z.string().trim().min(1).max(200),
  platformUrl: z.string().url().optional(),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ campaignId: string }> },
): Promise<Response> {
  const { campaignId } = await ctx.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON body" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { db } = getDb();
  try {
    const out = addDeliverableItem(db, { campaignId, ...parsed.data });
    return Response.json(out, { status: 201 });
  } catch {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }
}
