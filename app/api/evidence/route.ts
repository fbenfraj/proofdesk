// /api/evidence — the Evidence Inbox ingest seam (Story 2.1, FR-5). Route
// Handlers live at app/api/<resource>/route.ts and belong to the shell (AD-2):
// this one accepts multipart/form-data (so all four intake kinds share ONE
// endpoint — and the mobile capture path of Story 2.5 feeds the same pipeline),
// Zod-validates every field at the boundary BEFORE any effect (AD-8), then
// delegates to the ingest service.
//
// Honesty stance: the request NEVER carries `machine_or_human`, `uploaded_at`, or
// `data_origin`. Provenance is server-derived from the intake kind (AD-3/AD-19),
// the timestamp is the server clock at receipt (AD-11), and origin is inherited
// from the Campaign (AD-9). A malformed body, an over-cap file, or a disallowed
// content-type is rejected with 400 before any file is written or row inserted.
// Basic-auth (proxy.ts, AD-14) gates every request, so no auth code lives here.
//
// POST multipart/form-data { campaignId, intakeKind, type, [clientCapturedAt],
//   [url] | [note] | [file] } → 200 with the stored EvidenceItem view.

import { z } from "zod";
import { getDb } from "@/src/repositories";
import { ingestEvidence, readMatchState, runMatchForEvidenceItem } from "@/src/services";
import { getStorage } from "@/src/storage";

/** Upload size cap. The spine prescribes none for ingest; this is a sane bound
 *  enforced at the boundary so an abusive upload is rejected before any effect. */
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

const sharedFields = {
  campaignId: z.string().min(1),
  type: z.string().trim().min(1).max(200),
  clientCapturedAt: z.string().datetime({ offset: true }).optional(),
};

const IngestFields = z.discriminatedUnion("intakeKind", [
  z.object({
    ...sharedFields,
    intakeKind: z.literal("url"),
    url: z
      .string()
      .url()
      .refine((v) => /^https?:\/\//i.test(v), "Only http/https URLs are allowed"),
  }),
  z.object({
    ...sharedFields,
    intakeKind: z.literal("text"),
    note: z.string().trim().min(1).max(10_000),
  }),
  z.object({ ...sharedFields, intakeKind: z.literal("image") }),
  z.object({ ...sharedFields, intakeKind: z.literal("metric") }),
]);

/** Pull a non-empty string form field, else undefined (FormData yields "" for
 *  present-but-empty fields; normalize so `.optional()` behaves). */
function field(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const parsed = IngestFields.safeParse({
    campaignId: field(form, "campaignId"),
    intakeKind: field(form, "intakeKind"),
    type: field(form, "type"),
    clientCapturedAt: field(form, "clientCapturedAt"),
    url: field(form, "url"),
    note: field(form, "note"),
  });
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const fields = parsed.data;

  // File-kind intakes: validate the file at the boundary (presence, size cap,
  // content-type allowlist) BEFORE reading bytes or touching storage.
  let file: { bytes: Uint8Array; contentType: string; filename?: string } | undefined;
  if (fields.intakeKind === "image" || fields.intakeKind === "metric") {
    const upload = form.get("file");
    if (!(upload instanceof File)) {
      return Response.json({ error: "A file is required for this intake" }, { status: 400 });
    }
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(upload.type)) {
      return Response.json({ error: "Unsupported file type" }, { status: 400 });
    }
    if (upload.size > MAX_FILE_BYTES) {
      return Response.json({ error: "File too large" }, { status: 400 });
    }
    const bytes = new Uint8Array(await upload.arrayBuffer());
    // Trust the byte length over the declared size (a lying Content-Length).
    if (bytes.byteLength > MAX_FILE_BYTES) {
      return Response.json({ error: "File too large" }, { status: 400 });
    }
    file = { bytes, contentType: upload.type, filename: upload.name || undefined };
  }

  const { db } = getDb();
  const view = await ingestEvidence(db, getStorage(), {
    campaignId: fields.campaignId,
    intakeKind: fields.intakeKind,
    type: fields.type,
    clientCapturedAt: fields.clientCapturedAt,
    url: "url" in fields ? fields.url : undefined,
    note: "note" in fields ? fields.note : undefined,
    file,
  });
  if (!view) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }
  // Deterministic matching runs at ingest so every receipt gets its single
  // MatchSuggestion (Story 2.2, FR-6/AD-17) — a suggestion ONLY, never an
  // EvidenceLink. Bundled into the response so the inbox renders the suggested
  // match (or Unassigned) immediately, without a reload.
  runMatchForEvidenceItem(db, view.id);
  const match = readMatchState(db, view.id);
  return Response.json({ ...view, match }, { status: 201 });
}
