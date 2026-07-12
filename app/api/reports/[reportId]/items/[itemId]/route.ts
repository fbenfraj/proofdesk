// /api/reports/[reportId]/items/[itemId] — the operator inclusion-override seam
// (Story 4.1, FR-11, AD-21). Route Handlers belong to the shell (AD-2): Zod-parse
// the params + body at the boundary (AD-8), resolve the operator identity HERE
// (never from the body, so recorded responsibility can't be forged, cf. AD-11),
// and delegate to the report service. Basic-auth (proxy.ts, AD-14) gates every
// request.
//
// PATCH { inclusion: "included" | "excluded" | "default" } → set/clear the
//   operator's inclusion override. Including a Red Claim requires a recorded
//   Caveat + attribution → 409 otherwise (RedInclusionWithoutCaveatError).

import { z } from "zod";
import { getDb } from "@/src/repositories";
import {
  RedInclusionWithoutCaveatError,
  resolveOperatorIdentity,
  setReportItemInclusion,
} from "@/src/services";

const ItemParam = z.object({ reportId: z.string().min(1), itemId: z.string().min(1) });
// "default" clears the override back to the status default (→ null).
const PatchBody = z.object({ inclusion: z.enum(["included", "excluded", "default"]) });

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ reportId: string; itemId: string }> },
): Promise<Response> {
  const param = ItemParam.safeParse(await ctx.params);
  if (!param.success) {
    return Response.json({ error: "Invalid report/item id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = PatchBody.safeParse(raw);
  if (!body.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { operator } = resolveOperatorIdentity();
  const { db } = getDb();
  try {
    const view = setReportItemInclusion(db, {
      reportId: param.data.reportId,
      reportItemId: param.data.itemId,
      override: body.data.inclusion === "default" ? null : body.data.inclusion,
      overriddenBy: operator,
    });
    if (!view) {
      return Response.json({ error: "Report item not found in this report" }, { status: 404 });
    }
    return Response.json(view);
  } catch (err) {
    if (err instanceof RedInclusionWithoutCaveatError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
