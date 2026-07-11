// /api/deliverables/[deliverableId]/proof-requirements/[requirementId] — edit or
// remove one authored Proof Requirement (Story 3.2, FR-3). Shell layer (AD-2):
// Zod-parses params + body at the boundary (AD-8), delegates to the proof-brief
// service, returns the refreshed Deliverable brief.
//
// PATCH { criticality?, label? } → edit in place (id stable, evidence survives)
// DELETE                         → remove; 409 when the requirement has dependent
//                                  evidence (unassign it first — never orphan it)

import { z } from "zod";
import { getDb } from "@/src/repositories";
import { criticalitySchema } from "@/src/schema";
import { editRequirement, removeRequirement } from "@/src/services";

const Params = z.object({
  deliverableId: z.string().min(1),
  requirementId: z.string().min(1),
});

// At least one editable field must be present.
const EditBody = z
  .object({
    criticality: criticalitySchema.optional(),
    label: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.criticality !== undefined || v.label !== undefined, {
    message: "Nothing to edit",
  });

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ deliverableId: string; requirementId: string }> },
): Promise<Response> {
  const param = Params.safeParse(await ctx.params);
  if (!param.success) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = EditBody.safeParse(raw);
  if (!body.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { db } = getDb();
  const result = editRequirement(db, param.data.deliverableId, param.data.requirementId, {
    criticality: body.data.criticality,
    label: body.data.label,
  });
  if (result.ok) return Response.json(result.view);
  if (result.reason === "requirement-not-found") {
    return Response.json({ error: "Proof Requirement not found" }, { status: 404 });
  }
  return Response.json({ error: "Could not edit requirement" }, { status: 400 });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ deliverableId: string; requirementId: string }> },
): Promise<Response> {
  const param = Params.safeParse(await ctx.params);
  if (!param.success) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const { db } = getDb();
  const result = removeRequirement(db, param.data.deliverableId, param.data.requirementId);
  if (result.ok) return Response.json(result.view);
  if (result.reason === "requirement-not-found") {
    return Response.json({ error: "Proof Requirement not found" }, { status: 404 });
  }
  if (result.reason === "has-dependents") {
    return Response.json(
      { error: "Unassign the evidence linked to this requirement before removing it." },
      { status: 409 },
    );
  }
  return Response.json({ error: "Could not remove requirement" }, { status: 400 });
}
