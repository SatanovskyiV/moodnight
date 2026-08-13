import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AreaPlaceholder } from "@/components/area/placeholder";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: "studio.sections.poems" });

  return { title: t("title") };
}

export default async function StudioPoemsPage(props: LocaleParams) {
  await resolveLocale(props);

  return <StudioPoems />;
}

/**
 * Still a placeholder, and now one with a door in it.
 *
 * The dashboard this section describes — drafts, the queue, what is published —
 * needs an endpoint that lists an author's own poems, and `GET /poems` pins
 * `status: PUBLISHED`. What does exist is the page that writes one, so the panel
 * offers that rather than leaving a signed-in author at the end of the only path
 * the user menu gives them.
 */
function StudioPoems() {
  const t = useTranslations("studio.sections.poems");

  return (
    <AreaPlaceholder
      title={t("title")}
      line={t("line")}
      action={
        <Button asChild className="compact:px-8 px-5 whitespace-normal">
          <Link href="/studio/poems/new">{t("write")}</Link>
        </Button>
      }
    />
  );
}
