// POST /api/audit — the "Run Proof Audit" shell seam (Story 1.7, FR-9). Route
// Handlers live at app/api/<resource>/route.ts and belong to the shell (AD-2):
// this one Zod-parses its input at the boundary (AD-8 — input validation IS a
// security control), generates the server `now` here (AD-11 — the only clock),
// and delegates ALL work to the audit-run service. It never touches the DB
// driver, the core, or the filesystem directly. Basic-auth (proxy.ts, AD-14)
// already gates every request, so no auth code lives here.

import { z } from "zod";
import { getDb } from "@/src/repositories";
import { runCampaignAudit } from "@/src/services";

const RunAuditBody = z.object({
  campaignId: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RunAuditBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // The only clock the run ever sees, generated at the shell boundary (AD-11).
  const now = new Date().toISOString();
  const { db } = getDb();
  const result = runCampaignAudit(db, parsed.data.campaignId, now);
  return Response.json(result);
}
