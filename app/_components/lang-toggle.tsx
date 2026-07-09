"use client";

import { useRouter } from "next/navigation";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALES,
  type Locale,
  localeStrings,
} from "../_lib/i18n";

// EN|FR toggle base (UX-DR26). Writes the persisted locale cookie, flips
// <html lang> immediately for instant feedback, then refreshes so server
// components re-render every surface's copy in the new language. The cookie
// makes the choice persist across all four surfaces and future sessions.
export function LangToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const strings = localeStrings(locale);

  function selectLocale(next: Locale) {
    if (next === locale) return;
    // biome-ignore lint/suspicious/noDocumentCookie: document.cookie is the widely-supported write path; the CookieStore API is not yet universal.
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
    document.documentElement.lang = next;
    router.refresh();
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a <fieldset> groups form controls; this is an action group that switches UI language on click, so role="group" is the accurate semantic.
    <div className="pd-langtoggle" role="group" aria-label={strings.langToggleAria}>
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          className="pd-langtoggle__btn"
          // Full language name ("English"/"Français") for AT + tooltip; the
          // visible label stays the compact "EN"/"FR".
          title={localeStrings(option).langName}
          aria-label={localeStrings(option).langName}
          aria-pressed={option === locale}
          onClick={() => selectLocale(option)}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
