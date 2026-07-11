// /api/deliverables/[deliverableId]/proof-requirements — author the proof bar for
// one Deliverable (Story 3.2, FR-3). Shell layer (AD-2): Zod-discriminates the
// body at the boundary (AD-8) into either "apply a Deliverable-type template" or
// "add one requirement", delegates to the proof-brief service (rows-as-truth),
// and returns the refreshed Deliverable brief. 404 on an unknown Deliverable.
//
// POST { applyTemplate: <DeliverableType> }            → prefill from the Story-3.1
//                                                        default set (unset only)
// POST { kind, criticality, label }                    → add one requirement

import { z } from "zod";
import { getDb } from "@/src/repositories";
import { DELIVERABLE_TYPE } from "@/src/ruleset";
import { criticalitySchema } from "@/src/schema";
import { addRequirement, applyTemplate } from "@/src/services";

const DeliverableIdParam = z.object({ deliverableId: z.string().min(1) });

const RequirementBody = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("apply-template"),
    applyTemplate: z.enum(DELIVERABLE_TYPE),
  }),
  z.object({
    intent: z.literal("add"),
    kind: z.string().trim().min(1).max(120),
    criticality: criticalitySchema,
    label: z.string().trim().max(200).default(""),
  }),
]);

export async function POST(
  request: Request,
  ctx: { params: Promise<{ deliverableId: string }> },
): Promise<Response> {
  const param = DeliverableIdParam.safeParse(await ctx.params);
  if (!param.success) {
    return Response.json({ error: "Invalid deliverable id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = RequirementBody.safeParse(raw);
  if (!body.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { db } = getDb();
  const deliverableId = param.data.deliverableId;
  const result =
    body.data.intent === "apply-template"
      ? applyTemplate(db, deliverableId, body.data.applyTemplate)
      : addRequirement(db, deliverableId, {
          kind: body.data.kind,
          criticality: body.data.criticality,
          label: body.data.label,
        });

  if (result.ok) return Response.json(result.view, { status: 201 });
  if (result.reason === "deliverable-not-found") {
    return Response.json({ error: "Deliverable not found" }, { status: 404 });
  }
  if (result.reason === "already-set") {
    return Response.json(
      { error: "This Deliverable already has Proof Requirements; add them individually instead." },
      { status: 409 },
    );
  }
  return Response.json({ error: "Could not author requirement" }, { status: 400 });
}
