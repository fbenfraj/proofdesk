// src/services/evidence-ingest — the write orchestration behind the Evidence
// Inbox (Story 2.1, FR-5). Thin shell between the ingest Route Handler and the
// two seams (AD-2): it stores file bytes through the storage adapter and the
// EvidenceItem row through the repository, then returns a READ-ONLY view so the
// inbox re-renders from one response.
//
// Honesty stance (AD-3/AD-19): `machine_or_human` is DERIVED from the intake kind
// here, on the server — it is NEVER taken from the request. A `url` is machine
// (its liveness is machine-checkable; the actual check is Story 2.4); an image, a
// pasted note and a metric capture are Human assertions and can never be
// relabelled `machine`, whatever the caller sends.
//
// This service does NOT: fetch the URL / check liveness (Story 2.4), match to a
// Deliverable or write a MatchSuggestion / EvidenceLink (Story 2.2), or write a
// HumanConfirmation (Story 2.3). It only ingests the raw receipt.

import { createEvidenceItem, type Db, getCampaign } from "@/src/repositories";
import type { IntakeKind, MachineOrHuman } from "@/src/schema";
import type { EvidenceStorage } from "@/src/storage";

/** The satisfaction taxonomy's ingest rule (AD-19): only a link is machine;
 *  screenshots, notes and metric captures are always Human assertions. Exported
 *  so the honesty regression can assert it directly. */
export function provenanceForKind(kind: IntakeKind): MachineOrHuman {
  return kind === "url" ? "machine" : "human";
}

/** File extension for a stored object, from its MIME type (allow-listed set). */
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export interface IngestFile {
  bytes: Uint8Array;
  contentType: string;
  filename?: string;
}

export interface IngestEvidenceInput {
  campaignId: string;
  intakeKind: IntakeKind;
  /** Operator-editable type label (free text). */
  type: string;
  /** Optional, clearly labelled; never overrides the server `uploaded_at`. */
  clientCapturedAt?: string;
  /** Exactly one payload matching `intakeKind`: `url` for url, `note` for text,
   *  `file` for image/metric. Enforced by the Route Handler's Zod union. */
  url?: string;
  note?: string;
  file?: IngestFile;
}

export interface EvidenceItemView {
  id: string;
  campaignId: string;
  type: string;
  intakeKind: IntakeKind | null;
  machineOrHuman: MachineOrHuman;
  dataOrigin: string;
  uploadedAt: string;
  clientCapturedAt: string | null;
  url: string | null;
  note: string | null;
  storageKey: string | null;
  contentType: string | null;
  originalFilename: string | null;
  livenessLabel: string | null;
}

/** The columns any EvidenceItem row (insert-returning or a list read) exposes,
 *  mapped to the read-only inbox view. Kept in one place so the ingest response
 *  and the Evidence Inbox list render an identical shape. */
export interface EvidenceItemRow {
  id: string;
  campaignId: string;
  type: string;
  intakeKind: IntakeKind | null;
  machineOrHuman: MachineOrHuman;
  dataOrigin: string;
  uploadedAt: string;
  clientCapturedAt: string | null;
  url: string | null;
  note: string | null;
  storageKey: string | null;
  contentType: string | null;
  originalFilename: string | null;
  livenessLabel: string | null;
}

export function toEvidenceItemView(row: EvidenceItemRow): EvidenceItemView {
  return {
    id: row.id,
    campaignId: row.campaignId,
    type: row.type,
    intakeKind: row.intakeKind,
    machineOrHuman: row.machineOrHuman,
    dataOrigin: row.dataOrigin,
    uploadedAt: row.uploadedAt,
    clientCapturedAt: row.clientCapturedAt,
    url: row.url,
    note: row.note,
    storageKey: row.storageKey,
    contentType: row.contentType,
    originalFilename: row.originalFilename,
    livenessLabel: row.livenessLabel,
  };
}

/**
 * Ingest one raw Evidence receipt. Stores file bytes (image/metric) through the
 * storage adapter BEFORE the row insert, keyed by the row id, then writes the
 * EvidenceItem — which stamps a server-authoritative `uploaded_at` (AD-11) and
 * inherits the Campaign's `data_origin` at the single derivation site (AD-9).
 *
 * Returns `null` if the Campaign does not exist (the Route Handler maps this to a
 * clean 404) — checked BEFORE any storage write, so an unknown campaign never
 * leaves an orphan file. If the row insert throws after a successful file write
 * (e.g. a mixed-origin guard trips), the orphan file is tolerated garbage for
 * this prototype — no GC is built (out of scope, §8.2).
 */
export async function ingestEvidence(
  db: Db,
  storage: EvidenceStorage,
  input: IngestEvidenceInput,
): Promise<EvidenceItemView | null> {
  if (!getCampaign(db, input.campaignId)) return null;

  const machineOrHuman = provenanceForKind(input.intakeKind);
  const id = crypto.randomUUID();

  let url: string | undefined;
  let note: string | undefined;
  let storageKey: string | undefined;
  let contentType: string | undefined;
  let originalFilename: string | undefined;

  if (input.intakeKind === "image" || input.intakeKind === "metric") {
    if (!input.file) throw new Error("file payload required for image/metric intake");
    const ext = EXT_BY_CONTENT_TYPE[input.file.contentType] ?? "bin";
    storageKey = `${input.campaignId}/${id}.${ext}`;
    contentType = input.file.contentType;
    originalFilename = input.file.filename;
    await storage.put(storageKey, input.file.bytes, contentType);
  } else if (input.intakeKind === "url") {
    url = input.url;
  } else {
    note = input.note;
  }

  const row = createEvidenceItem(db, {
    id,
    campaignId: input.campaignId,
    type: input.type,
    machineOrHuman, // derived above — never from the caller
    intakeKind: input.intakeKind,
    url,
    note,
    storageKey,
    contentType,
    originalFilename,
    clientCapturedAt: input.clientCapturedAt,
    // uploadedAt omitted → repository stamps server `now` (AD-11).
  });

  return toEvidenceItemView(row);
}
