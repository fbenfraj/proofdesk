import { type Locale, localeStrings, type RailSurfaceKey } from "../_lib/i18n";

// Placeholder body for an operator surface whose content lands in a later
// story. Renders inside the shell with the surface's localized title so the
// rail nav + EN|FR persistence work across all four surfaces today.
export function SurfacePlaceholder({
  locale,
  surface,
}: {
  locale: Locale;
  surface: RailSurfaceKey;
}) {
  const strings = localeStrings(locale);
  return (
    <section>
      <h1 className="pd-page-title">{strings.rail[surface]}</h1>
      <p className="pd-lead">{strings.surfaceComingSoon}</p>
    </section>
  );
}
