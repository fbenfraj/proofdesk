// POST /api/campaigns - start a new live-demo scenario (Story AI-12). A thin
// shell (AD-2): Zod-validate the body at the boundary (AD-8), then delegate to the
// createScenario service. The scenario is ALWAYS a demo (is_demo=true, seeded) -
// the request cannot ask for a `real`, exportable campaign (AD-9). Basic-auth
// (proxy.ts, AD-14) gates the request, so no auth code lives here.
//
// POST application/json { name?: string } -> 201 { id, name }

import { z } from "zod";
import { getDb } from "@/src/repositories";
import { createScenario } from "@/src/services";

const Body = z.object({ name: z.string().trim().min(1).max(120).optional() });

export async function POST(request: Request): Promise<Response> {
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
  const scenario = createScenario(db, parsed.data);
  return Response.json(scenario, { status: 201 });
}
