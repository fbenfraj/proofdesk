// /api/evidence/[evidenceItemId]/unassign — reverse an operator assignment
// (Story 2.2, NFR-D7). The undo path for Confirm/Reassign: it drops the item's
// `source=operator` EvidenceLink(s) and re-runs the deterministic matcher, so a
// rule suggestion is restored where one exists. Immediate and reversible — no
// confirmation dialog. `suggested` links / MatchSuggestions are never touched
// (AD-17). Basic-auth (proxy.ts, AD-14) gates every request.
//
// POST → { match } (the item's restored match state).

import { z } from "zod";
import { getDb } from "@/src/repositories";
import { unassignEvidence } from "@/src/services";

const Param = z.object({ evidenceItemId: z.string().min(1) });

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ evidenceItemId: string }> },
): Promise<Response> {
  const param = Param.safeParse(await ctx.params);
  if (!param.success) {
    return Response.json({ error: "Invalid evidence id" }, { status: 400 });
  }

  const { db } = getDb();
  const state = unassignEvidence(db, param.data.evidenceItemId);
  if (!state) {
    return Response.json({ error: "Evidence item not found" }, { status: 404 });
  }
  return Response.json({ match: state });
}
