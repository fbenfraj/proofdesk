// src/storage — S3-shaped evidence-file adapter (AD-2, AD-10). The ONLY code
// allowed to touch evidence files. Swap-seam: local disk now -> Scaleway/OVH
// object storage later, behind this adapter.
//
// The contract is deliberately S3-shaped (put/get an object by key, content-type
// travels with the object) so the disk implementation can be swapped for an
// object store without any caller change. Keys are forward-slashed and portable
// (e.g. `campaignId/evidenceItemId.png`); the disk adapter maps a key to a path
// internally and callers never see a filesystem path. `uploaded_at` lives on the
// DB row, NOT here (AD-11) — the adapter stores only bytes + content-type.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

export interface EvidenceStorage {
  /** Store `bytes` under `key` with its MIME `contentType`. Overwrites. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Fetch the object at `key`, or `null` if absent. */
  get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
}

/** Reject keys that could escape the storage root (path-traversal / absolute).
 *  Keys are server-generated so this is defense-in-depth, kept cheap. */
function assertSafeKey(key: string): void {
  if (!key || key.startsWith("/") || key.startsWith("\\") || key.includes("..")) {
    throw new Error(`Unsafe storage key rejected: ${JSON.stringify(key)}`);
  }
}

/** Local-disk implementation. Content-type is persisted in a sidecar file so a
 *  `get` can return it S3-style (disk has no native object metadata). */
export function createDiskStorage(rootDir: string): EvidenceStorage {
  const root = resolve(rootDir);
  const pathFor = (key: string): string => {
    assertSafeKey(key);
    const p = resolve(root, key);
    // Second guard: the resolved path must stay under root.
    if (p !== root && !p.startsWith(root + sep)) {
      throw new Error(`Unsafe storage key rejected: ${JSON.stringify(key)}`);
    }
    return p;
  };

  return {
    async put(key, bytes, contentType) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
      await writeFile(`${path}.contenttype`, contentType, "utf8");
    },
    async get(key) {
      const path = pathFor(key);
      try {
        const bytes = await readFile(path);
        const contentType = await readFile(`${path}.contenttype`, "utf8");
        return { bytes: new Uint8Array(bytes), contentType };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
  };
}

/** The default evidence directory — one directory alongside the SQLite file
 *  (BUILD-HANDOFF §8: "State = one SQLite file + one evidence directory"). */
const DEFAULT_EVIDENCE_DIR = join(process.cwd(), "data", "evidence");

let singleton: EvidenceStorage | undefined;

/** Process-wide storage singleton, mirroring `getDb()`. Reads `EVIDENCE_DIR`. */
export function getStorage(): EvidenceStorage {
  if (!singleton) {
    singleton = createDiskStorage(process.env.EVIDENCE_DIR ?? DEFAULT_EVIDENCE_DIR);
  }
  return singleton;
}
