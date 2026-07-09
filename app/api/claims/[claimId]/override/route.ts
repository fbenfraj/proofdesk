// /api/claims/[claimId]/override — the Operator-override write seam (Story 1.9,
// FR-10). Route Handlers live at app/api/<resource>/route.ts and belong to the
// shell (AD-2): this one Zod-parses the route param + body at the boundary (AD-8
// — input validation IS a security control) and resolves the operator identity
// HERE (never from the body, so who authored a decision can't be forged, cf. the
// server clock of AD-11), then delegates to the override service. It never runs
// the audit — override is an overlay on the machine verdict, not a recompute
// (AD-6). Basic-auth (proxy.ts, AD-14) already gates every request, so no auth
// code lives here.
//
// POST   { finalStatus }  → set/change the override; returns the refreshed card.
// DELETE                  → clear the override (toggle OFF); returns the card.

import { z } from "zod";
import { getDb } from "@/src/repositories";
import { proofStatusSchema } from "@/src/schema";
import { clearClaimOverride, resolveOperatorIdentity, setClaimOverride } from "@/src/services";

const ClaimIdParam = z.object({ claimId: z.string().min(1) });
// Only the target status crosses the boundary — `authoredBy` is shell-resolved.
const SetOverrideBody = z.object({ finalStatus: proofStatusSchema });

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
  const body = SetOverrideBody.safeParse(raw);
  if (!body.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { operator } = resolveOperatorIdentity();
  const { db } = getDb();
  const view = setClaimOverride(db, {
    claimId: param.data.claimId,
    finalStatus: body.data.finalStatus,
    authoredBy: operator,
  });
  if (!view) {
    return Response.json({ error: "Claim not found" }, { status: 404 });
  }
  return Response.json(view);
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ claimId: string }> },
): Promise<Response> {
  const param = ClaimIdParam.safeParse(await ctx.params);
  if (!param.success) {
    return Response.json({ error: "Invalid claim id" }, { status: 400 });
  }

  const { db } = getDb();
  const view = clearClaimOverride(db, param.data.claimId);
  if (!view) {
    return Response.json({ error: "Claim not found" }, { status: 404 });
  }
  return Response.json(view);
}
