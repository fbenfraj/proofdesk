import "./provenance-chip.css";
import { InfoTip } from "@/app/_components/info-tip";
import { PROVENANCE_TOKENS } from "../_lib/design-tokens";
import { type Locale, localeStrings } from "../_lib/i18n";

/** The cool-slate / warm-taupe provenance chip (AD-3 / NFR-D1) — the single
 *  honesty-label renderer, shared by the Claim Card drawer (Story 1.8) and the
 *  Evidence Inbox (Story 2.1). Kept deliberately OFF the R/Y/G status scale so
 *  the two visual systems never collide. The glyph is decorative (`aria-hidden`);
 *  the label ("Machine-checked fact" / "Human assertion") carries the meaning, so
 *  provenance is never distinguished by colour alone. No hooks → usable from both
 *  server and client components. */
export function ProvenanceChip({
  provenance,
  locale,
}: {
  provenance: "machine" | "human";
  locale: Locale;
}) {
  const d = localeStrings(locale).drawer;
  const token = PROVENANCE_TOKENS[provenance];
  const label = provenance === "machine" ? d.provenance.machine : d.provenance.human;
  return (
    <span className={`pd-prov pd-prov--${provenance}`}>
      <span className="pd-prov__glyph" aria-hidden="true">
        {token.glyph}
      </span>
      <InfoTip
        termKey={provenance === "machine" ? "machine-checked" : "human-assertion"}
        locale={locale}
      >
        {label}
      </InfoTip>
    </span>
  );
}
