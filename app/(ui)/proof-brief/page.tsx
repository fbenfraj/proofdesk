import { cookies } from "next/headers";
import { SEED_DEMO_CAMPAIGN_ID } from "@/seed/demo-campaign";
import { getDb } from "@/src/repositories";
import { getProofBrief, type ProofBriefView } from "@/src/services";
import { ProofBrief } from "../../_components/proof-brief";
import { LOCALE_COOKIE, parseLocale } from "../../_lib/i18n";

// Proof Brief — the per-Deliverable proof-bar authoring surface (Story 3.2,
// FR-3, UX-DR21). A Server Component: it reads the seeded campaign's Deliverables
// and their authored Proof Requirements server-side through the service seam
// (AD-2), plus the Story-3.1 default-set templates, and hands a plain view to the
// client. The authored bar is persisted as `proof_requirement` rows — the SAME
// rows the audit reads (rows-as-truth), so "the configured set is exactly what
// the Proof Audit evaluates against" holds. `cookies()` makes this route dynamic,
// so the read happens at request time (not at build), reflecting edits.
export default async function ProofBriefPage() {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);

  let brief: ProofBriefView | null = null;
  try {
    const { db } = getDb();
    brief = getProofBrief(db, SEED_DEMO_CAMPAIGN_ID);
  } catch {
    brief = null;
  }

  return <ProofBrief locale={locale} initialBrief={brief} />;
}
