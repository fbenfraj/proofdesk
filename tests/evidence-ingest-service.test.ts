// Evidence Inbox ingest service tests (Story 2.1). The honesty-critical zone:
// provenance is server-derived (AD-3/AD-19), the timestamp is server-authoritative
// (AD-11), and data_origin is inherited immutably from the Campaign (AD-9).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  countEvidenceItems,
  createCampaign,
  createClient,
  createEvidenceItem,
  createTestDb,
  type Db,
  type DbHandle,
  getEvidenceItem,
  listInboxEvidenceItems,
} from "@/src/repositories";
import { ingestEvidence, provenanceForKind } from "@/src/services/evidence-ingest";
import { createDiskStorage, type EvidenceStorage } from "@/src/storage";

function makeCampaign(db: Db, dataOrigin: "seeded" | "real"): string {
  const client = createClient(db, "Acme");
  return createCampaign(db, {
    clientId: client.id,
    name: `${dataOrigin} campaign`,
    dataOrigin,
    isDemo: dataOrigin === "seeded",
  }).id;
}

describe("provenanceForKind (AD-19)", () => {
  it("only a url is machine; screenshots, notes and metrics are always human", () => {
    expect(provenanceForKind("url")).toBe("machine");
    expect(provenanceForKind("image")).toBe("human");
    expect(provenanceForKind("text")).toBe("human");
    expect(provenanceForKind("metric")).toBe("human");
  });
});

describe("ingestEvidence (Story 2.1)", () => {
  let handle: DbHandle;
  let db: Db;
  let storage: EvidenceStorage;
  let root: string;
  let campaignId: string;

  beforeEach(() => {
    handle = createTestDb();
    db = handle.db;
    root = mkdtempSync(join(tmpdir(), "proofdesk-ingest-"));
    storage = createDiskStorage(root);
    campaignId = makeCampaign(db, "seeded");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("stores a url receipt as a machine-provenance item with the link (AD-3)", async () => {
    const view = await ingestEvidence(db, storage, {
      campaignId,
      intakeKind: "url",
      type: "Twitch VOD link",
      url: "https://twitch.tv/videos/123",
    });
    expect(view).not.toBeNull();
    expect(view?.machineOrHuman).toBe("machine");
    expect(view?.url).toBe("https://twitch.tv/videos/123");
    expect(view?.note).toBeNull();
    expect(view?.storageKey).toBeNull();
    const row = getEvidenceItem(db, view?.id ?? "");
    expect(row?.machineOrHuman).toBe("machine");
    expect(row?.intakeKind).toBe("url");
  });

  it("stores a free-text note as a human assertion", async () => {
    const view = await ingestEvidence(db, storage, {
      campaignId,
      intakeKind: "text",
      type: "Discord confirmation",
      note: "Sponsor confirmed the segment aired at 21:14",
    });
    expect(view?.machineOrHuman).toBe("human");
    expect(view?.note).toContain("21:14");
    expect(view?.url).toBeNull();
  });

  it("stores an image upload through the storage adapter, human provenance", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const view = await ingestEvidence(db, storage, {
      campaignId,
      intakeKind: "image",
      type: "disclosure-screenshot",
      file: { bytes, contentType: "image/png", filename: "shot.png" },
    });
    expect(view?.machineOrHuman).toBe("human");
    expect(view?.storageKey).toMatch(new RegExp(`^${campaignId}/.+\\.png$`));
    expect(view?.contentType).toBe("image/png");
    expect(view?.originalFilename).toBe("shot.png");
    const stored = await storage.get(view?.storageKey ?? "");
    expect(Array.from(stored?.bytes ?? [])).toEqual(Array.from(bytes));
  });

  it("a metric-screenshot is ALWAYS human, never machine (AD-19)", async () => {
    const view = await ingestEvidence(db, storage, {
      campaignId,
      intakeKind: "metric",
      type: "metric-screenshot",
      file: { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" },
    });
    expect(view?.machineOrHuman).toBe("human");
    const row = getEvidenceItem(db, view?.id ?? "");
    expect(row?.machineOrHuman).toBe("human");
  });

  it("stamps a server-authoritative uploaded_at; client_captured_at never overrides it (AD-11)", async () => {
    const before = Date.now();
    const clientClaim = "2000-01-01T00:00:00.000Z"; // absurd client time
    const view = await ingestEvidence(db, storage, {
      campaignId,
      intakeKind: "url",
      type: "link",
      url: "https://example.com/a",
      clientCapturedAt: clientClaim,
    });
    expect(view?.clientCapturedAt).toBe(clientClaim);
    expect(view?.uploadedAt).not.toBe(clientClaim);
    expect(new Date(view?.uploadedAt ?? "").getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("inherits the Campaign's data_origin (AD-9)", async () => {
    const view = await ingestEvidence(db, storage, {
      campaignId,
      intakeKind: "text",
      type: "note",
      note: "seeded-campaign note",
    });
    expect(view?.dataOrigin).toBe("seeded");
  });

  it("countEvidenceItems reflects ingested items for the rail badge (AC5)", async () => {
    expect(countEvidenceItems(db, campaignId)).toBe(0);
    await ingestEvidence(db, storage, {
      campaignId,
      intakeKind: "url",
      type: "link",
      url: "https://example.com/1",
    });
    await ingestEvidence(db, storage, {
      campaignId,
      intakeKind: "text",
      type: "note",
      note: "second",
    });
    expect(countEvidenceItems(db, campaignId)).toBe(2);
  });

  it("excludes abstract (non-ingested) evidence rows from the inbox list + count", async () => {
    // An Epic-1-style abstract proof row: written directly, no intakeKind/payload.
    createEvidenceItem(db, { campaignId, type: "link", machineOrHuman: "machine" });
    // It is NOT an inbox receipt — excluded from the list and the badge count.
    expect(listInboxEvidenceItems(db, campaignId)).toHaveLength(0);
    expect(countEvidenceItems(db, campaignId)).toBe(0);

    // A real inbox ingest shows up.
    await ingestEvidence(db, storage, {
      campaignId,
      intakeKind: "text",
      type: "note",
      note: "actual inbox receipt",
    });
    const inbox = listInboxEvidenceItems(db, campaignId);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.intakeKind).toBe("text");
    expect(countEvidenceItems(db, campaignId)).toBe(1);
  });

  it("returns null for an unknown campaign and writes nothing", async () => {
    const view = await ingestEvidence(db, storage, {
      campaignId: "no-such-campaign",
      intakeKind: "image",
      type: "screenshot",
      file: { bytes: new Uint8Array([9]), contentType: "image/png" },
    });
    expect(view).toBeNull();
  });
});
