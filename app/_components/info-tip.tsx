"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import type { Locale } from "@/app/_lib/i18n";
import { type TermKey, termDefinition, termLabel } from "@/app/_lib/term-glossary";
import "./info-tip.css";

/**
 * AI-9 teaching layer, mechanism 2: attaches a plain-language definition to a
 * Record term without changing the precise word. The visible text is either
 * `children` or the term's own label; the tooltip carries the definition from
 * the single-source glossary. Reveals on hover and keyboard focus; the
 * definition is linked via aria-describedby for assistive tech.
 */
export function InfoTip({
  termKey,
  locale,
  children,
}: {
  termKey: TermKey;
  locale: Locale;
  children?: ReactNode;
}) {
  const id = useId();
  const definition = termDefinition(locale, termKey);
  const visible = children ?? termLabel(locale, termKey);
  return (
    <span className="pd-infotip">
      <button type="button" className="pd-infotip__term" aria-describedby={id}>
        {visible}
      </button>
      <span role="tooltip" id={id} className="pd-infotip__bubble">
        {definition}
      </span>
    </span>
  );
}
