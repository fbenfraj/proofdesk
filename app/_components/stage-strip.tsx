"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CampaignStageState } from "@/src/services";
import { type Locale, localeStrings, STAGE_STEPS } from "../_lib/i18n";
import { activeStageKey, formatStageSignal, nextStage, stageSubhead } from "./stage-strip-logic";

/** The horizontal workflow strip that replaces the rail (AI-10). Free-click any
 *  stage (a Link per step); active via pathname; honest state per step; the
 *  active stage's subhead sits beneath. */
export function StageStrip({
  locale,
  stageState,
}: {
  locale: Locale;
  stageState: CampaignStageState;
}) {
  const pathname = usePathname();
  const s = localeStrings(locale);
  const active = activeStageKey(pathname);

  return (
    <nav className="pd-strip" aria-label={s.campaignLabel}>
      <ol className="pd-strip__steps">
        {STAGE_STEPS.map((step) => {
          const isActive = step.key === active;
          return (
            <li key={step.key} className="pd-strip__item">
              <Link
                href={step.href}
                className="pd-strip__link"
                aria-current={isActive ? "page" : undefined}
              >
                <span className="pd-strip__order label-caps" aria-hidden="true">
                  {step.order}
                </span>
                <span className="pd-strip__label">{s.stage.labels[step.key]}</span>
                <span className="pd-strip__signal label-caps">
                  {formatStageSignal(stageState, step.key, s)}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="pd-strip__subhead">{stageSubhead(s, active)}</p>
    </nav>
  );
}

/** The forward handoff at the foot of the canvas - "Next: <stage>", or nothing
 *  on the last stage. A separate island so the server page content stays a RSC. */
export function StageNext({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const s = localeStrings(locale);
  const next = nextStage(activeStageKey(pathname));
  if (!next) return null;
  return (
    <Link href={next.href} className="pd-strip__next">
      {s.stage.nextPrefix}
      {s.stage.labels[next.key]} →
    </Link>
  );
}
