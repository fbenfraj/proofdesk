// /api/evidence/[evidenceItemId]/assign — operator affirmation of a match (Story
// 2.2, FR-6, AD-17). Route Handlers belong to the shell (AD-2): this one
// Zod-parses the route param + body at the boundary (AD-8), then delegates to the
// matching service, which writes an `EvidenceLink source=operator` — the ONLY
// link kind that enters the AuditSnapshot. `source` is set server-side, never
// from the request, so a machine suggestion can never be forged into an operator
// link. Used by BOTH Confirm (the suggested Deliverable) and Reassign (an
// operator-chosen one): one write path, so an item ends with exactly one operator
// link. Actions are immediate and reversible (unassign) — no confirmation dialog
// (NFR-D7). ProofDesk has one shared operator credential (AD-14), so the actor is
// implicit; no per-link author column exists. Basic-auth (proxy.ts) gates every
// request, so no auth code lives here.
//
// POST { deliverableId } → { match } (the item's new match state).

import { z } from "zod";
import { getDb, MixedOriginError } from "@/src/repositories";
import { assignEvidence, readMatchState } from "@/src/services";

const Param = z.object({ evidenceItemId: z.string().min(1) });
const Body = z.object({ deliverableId: z.string().min(1) });

export async function POST(
  request: Request,
  ctx: { params: Promise<{ evidenceItemId: string }> },
): Promise<Response> {
  const param = Param.safeParse(await ctx.params);
  if (!param.success) {
    return Response.json({ error: "Invalid evidence id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = Body.safeParse(raw);
  if (!body.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { db } = getDb();
  try {
    const assignment = assignEvidence(db, {
      evidenceItemId: param.data.evidenceItemId,
      deliverableId: body.data.deliverableId,
    });
    if (!assignment) {
      return Response.json({ error: "Evidence item or Deliverable not found" }, { status: 404 });
    }
  } catch (err) {
    // Assigning across campaigns is a mixed-origin write (AD-9) — a bad request.
    if (err instanceof MixedOriginError) {
      return Response.json({ error: "Cross-campaign assignment rejected" }, { status: 400 });
    }
    throw err;
  }

  return Response.json({ match: readMatchState(db, param.data.evidenceItemId) });
}
