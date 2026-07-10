// /api/claims/[claimId]/confirm — the "page shows the Deliverable" confirmation
// write seam (Story 2.3, FR-7, AD-5, AD-18). Route Handlers live at
// app/api/<resource>/route.ts and belong to the shell (AD-2): this one Zod-parses
// the route param + body at the boundary (AD-8) and resolves BOTH the operator
// identity and the clock HERE — never from the body — so who/when a human
// attested can't be forged (integrity, cf. the server clock of AD-11, the single
// credential of AD-14). It then delegates to the confirmation service, which
// appends an immutable `machine_or_human = human` row against one of the Claim's
// operator-affirmed links (a suggested link can never be confirmed, AD-17).
//
// It NEVER runs the audit (AD-6): the appended confirmation restales the
// AuditResult cache, so the verdict recomputes on the next explicit "Run Proof
// Audit" (Story 1.7), never behind the operator's back. Basic-auth (proxy.ts,
// AD-14) gates every request, so no auth code lives here.
//
// POST { evidenceLinkId } → append a confirmation; returns the refreshed Claim
// Card view.

import { z } from "zod";
import { getDb } from "@/src/repositories";
import { confirmDeliverablePage, resolveOperatorIdentity } from "@/src/services";

const ClaimIdParam = z.object({ claimId: z.string().min(1) });
const ConfirmBody = z.object({ evidenceLinkId: z.string().min(1) });

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
  const body = ConfirmBody.safeParse(raw);
  if (!body.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { operator } = resolveOperatorIdentity();
  const { db } = getDb();
  const view = confirmDeliverablePage(db, {
    claimId: param.data.claimId,
    evidenceLinkId: body.data.evidenceLinkId,
    confirmedBy: operator,
    confirmedAt: new Date().toISOString(),
  });
  if (!view) {
    return Response.json({ error: "Claim or EvidenceLink not found" }, { status: 404 });
  }
  return Response.json(view);
}
