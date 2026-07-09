import { cookies } from "next/headers";
import { SurfacePlaceholder } from "../../_components/surface-placeholder";
import { LOCALE_COOKIE, parseLocale } from "../../_lib/i18n";

export default async function ProofBriefPage() {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  return <SurfacePlaceholder locale={locale} surface="proof-brief" />;
}
