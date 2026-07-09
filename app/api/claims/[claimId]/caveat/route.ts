// /api/claims/[claimId]/caveat — the Caveat-authoring write seam (Story 1.9,
// FR-10, AD-6). Route Handlers live at app/api/<resource>/route.ts and belong to
// the shell (AD-2): this one Zod-parses the route param + body at the boundary
// (AD-8) and resolves the operator identity HERE (never from the body — who
// authored a caveat can't be forged, cf. the server clock of AD-11), then
// delegates to the caveat service. Caveats are append-only (AD-18) and carry only
// operator narrative — machine reasons live in the trace, never as caveats
// (AD-6). It never runs the audit. Basic-auth (proxy.ts, AD-14) gates every
// request, so no auth code lives here.
//
// POST { text } → append a caveat; returns the refreshed Claim Card view.

import { z } from "zod";
import { getDb } from "@/src/repositories";
import { addClaimCaveat, resolveOperatorIdentity } from "@/src/services";

const ClaimIdParam = z.object({ claimId: z.string().min(1) });
// A caveat is operator narrative; bound the length so the boundary rejects an
// empty or abusive payload before any effect runs (AD-8).
const AddCaveatBody = z.object({ text: z.string().trim().min(1).max(2000) });

export async function POST(
  request: Request,
  ctx: { params: Promise<{ claimId: string }> },
): Promise<Response> {
  const param = ClaimIdParam.safeParse(await ctx.params);
  if (!param.success) {
    return Response.json({ error: "Invalid claim id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = AddCaveatBody.safeParse(raw);
  if (!body.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { operator } = resolveOperatorIdentity();
  const { db } = getDb();
  const view = addClaimCaveat(db, {
    claimId: param.data.claimId,
    text: body.data.text,
    authoredBy: operator,
  });
  if (!view) {
    return Response.json({ error: "Claim not found" }, { status: 404 });
  }
  return Response.json(view);
}
