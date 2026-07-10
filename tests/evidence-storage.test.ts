// Storage adapter seam tests (AD-2, AD-10). The S3-shaped adapter is the ONLY
// code allowed to touch the filesystem; here we prove the put/get round-trip and
// the path-traversal guard on a throwaway temp directory.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDiskStorage, type EvidenceStorage } from "@/src/storage";

describe("evidence storage adapter (AD-10)", () => {
  let root: string;
  let storage: EvidenceStorage;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "proofdesk-storage-"));
    storage = createDiskStorage(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("round-trips bytes and content-type through a slashed key", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]); // PNG-ish header
    await storage.put("camp-1/ev-abc.png", bytes, "image/png");

    const got = await storage.get("camp-1/ev-abc.png");
    expect(got).not.toBeNull();
    expect(got?.contentType).toBe("image/png");
    expect(Array.from(got?.bytes ?? [])).toEqual(Array.from(bytes));
  });

  it("returns null for an unknown key", async () => {
    expect(await storage.get("camp-1/does-not-exist.png")).toBeNull();
  });

  it("rejects path-traversal keys before touching disk", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await expect(storage.put("../escape.png", bytes, "image/png")).rejects.toThrow();
    await expect(storage.put("/abs/escape.png", bytes, "image/png")).rejects.toThrow();
    await expect(storage.get("../../etc/passwd")).rejects.toThrow();
  });
});
