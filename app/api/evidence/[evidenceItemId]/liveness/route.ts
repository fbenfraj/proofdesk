// /api/evidence/[evidenceItemId]/liveness — run an SSRF-hardened link-liveness
// check for one link-type EvidenceItem (Story 2.4, FR-7, AD-7/AD-8). Route
// Handlers belong to the shell (AD-2): this one Zod-parses the route param at the
// boundary (AD-8) then delegates to the liveness service, which runs the
// verification adapter (the only outbound-HTTP seam) and persists the four-value
// label + its audit trail. The service NEVER touches the DB driver or the network
// directly — this handler even less so.
//
// Basic-auth (proxy) gates every request, so no auth code lives here. The check
// is a WRITE (it updates the item's last-known liveness), hence POST.
//
// POST → { liveness } (the item's new four-value liveness view), or 404 when the
// item does not exist or is not a link-type receipt.

import { z } from "zod";
import { getDb } from "@/src/repositories";
import { runEvidenceLiveness } from "@/src/services";

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
  const liveness = await runEvidenceLiveness(db, param.data.evidenceItemId);
  if (!liveness) {
    return Response.json(
      { error: "Evidence item not found or not a link-type receipt" },
      { status: 404 },
    );
  }

  return Response.json({ liveness });
}
