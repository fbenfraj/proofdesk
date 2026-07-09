// GET /api/claims/[claimId] — the Claim Card read seam (Story 1.8, FR-8). Route
// Handlers live at app/api/<resource>/route.ts and belong to the shell (AD-2):
// this one Zod-parses the route param at the boundary (AD-8) and delegates to
// the read-only `getClaimCard` view model. It is a PURE READ — no clock, no
// writes, and it never reaches the write-capable resolver, so opening a Claim
// Card never runs the audit (AD-6). Basic-auth (AD-14) already gates every
// request, so no auth code lives here.

import { z } from "zod";
import { getDb } from "@/src/repositories";
import { getClaimCard } from "@/src/services";

const ClaimIdParam = z.object({ claimId: z.string().min(1) });

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ claimId: string }> },
): Promise<Response> {
  const parsed = ClaimIdParam.safeParse(await ctx.params);
  if (!parsed.success) {
    return Response.json({ error: "Invalid claim id" }, { status: 400 });
  }

  const { db } = getDb();
  const view = getClaimCard(db, parsed.data.claimId);
  if (!view) {
    return Response.json({ error: "Claim not found" }, { status: 404 });
  }
  return Response.json(view);
}
