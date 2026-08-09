import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AreaPlaceholder } from "@/components/area/placeholder";
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

function StudioPoems() {
  const t = useTranslations("studio.sections.poems");

  return <AreaPlaceholder title={t("title")} line={t("line")} />;
}
