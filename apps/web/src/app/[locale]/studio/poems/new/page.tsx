import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AreaHeading } from "@/components/area/heading";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

import { ComposeForm } from "./compose-form";

/**
 * The studio layout's `template` puts the area's name after this, so the tab
 * reads "Новий вірш · Моє письмо" without this page naming the studio.
 */
export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: "studio.sections.poems.compose" });

  return { title: t("title") };
}

/**
 * Writing a poem — the first page in the studio with something in it.
 *
 * A Server Component holding a client form, which is the same division the
 * registration and sign-in pages make: the heading and both message lookups
 * happen at build time and the browser is sent the fields. `resolveLocale` is
 * what opts this into static rendering, and the form is a reference in the
 * payload rather than a page assembled in the browser.
 *
 * It is nested under `/studio/poems` on purpose rather than living at
 * `/poems/new`: `minimumRole` reads the longest matching prefix out of
 * `STUDIO_LINKS`, so this address arrives already gated at `AUTHOR` by the
 * shell above it, with no row of its own and no gate in this file. A top-level
 * route would have needed both.
 */
export default async function ComposePoemPage(props: LocaleParams) {
  await resolveLocale(props);

  // Split out because `useTranslations` is a hook and this component has to be
  // async to await the params — the same pairing as every page on the site.
  return <ComposePoem />;
}

function ComposePoem() {
  const t = useTranslations("studio.sections.poems.compose");

  return (
    // The same wrapper `AreaPlaceholder` uses, so this page sits in the shell at
    // the rhythm its neighbour set.
    <section className="flex flex-col gap-8">
      <AreaHeading title={t("title")} line={t("line")} />

      <ComposeForm />
    </section>
  );
}
