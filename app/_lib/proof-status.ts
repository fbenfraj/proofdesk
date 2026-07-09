// The single mapping from the domain Proof Status (green | yellow | red) to the
// UI display key (defensible | caveated | cant-claim). It lives in the UI layer
// so the domain/core carries no presentation concern and the dependency points
// toward the core (AD-2). `import type` keeps this free of any runtime
// dependency on the schema/driver.

import type { ProofStatusKey } from "@/app/_lib/design-tokens";
import type { ProofStatus } from "@/src/schema/enums";

const DOMAIN_TO_DISPLAY: Record<ProofStatus, ProofStatusKey> = {
  green: "defensible",
  yellow: "caveated",
  red: "cant-claim",
};

/** Map a domain Proof Status to its UI display key (1:1). */
export function proofStatusToDisplayKey(status: ProofStatus): ProofStatusKey {
  return DOMAIN_TO_DISPLAY[status];
}
