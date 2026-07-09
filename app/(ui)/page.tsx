import { cookies } from "next/headers";
import { LOCALE_COOKIE, localeStrings, parseLocale } from "../_lib/i18n";

// Audit Cockpit home — the default operator surface, rendered inside the shell
// (app/(ui)/layout.tsx). The claimed-vs-proven Board itself arrives in Story
// 1.6; for now the surface shows its localized title + a lead note.
export default async function AuditCockpitPage() {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const strings = localeStrings(locale);

  return (
    <section>
      <h1 className="pd-page-title">{strings.rail["audit-cockpit"]}</h1>
      <p className="pd-lead">{strings.cockpitLead}</p>
    </section>
  );
}
