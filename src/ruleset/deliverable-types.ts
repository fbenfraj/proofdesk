// src/ruleset — canonical Deliverable-type keys for the Proof Brief templates
// (AD-13). These are the stable identity for the default requirement sets in
// `default-requirement-sets.ts`; they are versioned IP the pure core may import
// (AD-2 — nothing effectful here).
//
// SCOPE: Story 3.1 defines the keys + the per-type default sets ONLY. The
// free-text `deliverable.type` column is NOT canonicalised here — the
// free-text → key mapping and the template picker UI land in Story 3.2. Keys use
// kebab-case (file/dir naming rule); glossary vocabulary stays English in code.

/** The five Deliverable types that ship a default Proof Requirement set. */
export const DELIVERABLE_TYPE = [
  "twitch-sponsor-segment",
  "instagram-story",
  "instagram-reel",
  "tiktok",
  "youtube-integration",
] as const;

export type DeliverableType = (typeof DELIVERABLE_TYPE)[number];
