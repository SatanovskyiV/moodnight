import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { STUDIO_LINKS } from "@/components/area/links";
import { AreaShell } from "@/components/area/shell";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

/**
 * `default` names the area itself, for `/studio`; `template` is what each
 * section below fills in, so a tab reads "Вірші · Моє письмо" without any page
 * repeating the area's name.
 */
export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: "studio" });

  return { title: { default: t("title"), template: `%s · ${t("title")}` } };
}

/**
 * The author's workshop — everything a member does with their own writing.
 *
 * Whose it is, is decided one level down: `AreaShell` reads the floor for this
 * URL out of `STUDIO_LINKS` and puts a gate around the page. Every row of that
 * table is `AUTHOR`, the role a registration gets by default, so in practice the
 * studio's only question is whether anybody is signed in at all — but it is
 * asked through the same table the administration uses, so raising a section's
 * floor later is a one-line edit and not a new mechanism.
 *
 * A Server Component, like every layout here: `resolveLocale` is what opts the
 * subtree into static rendering, and `children` — the section's own page —
 * therefore arrives at the client shell already built.
 */
export default async function StudioLayout({
  children,
  ...props
}: LocaleParams & { children: React.ReactNode }) {
  await resolveLocale(props);

  // Split out because `useTranslations` is a hook and this component has to be
  // async to await the params — the same pairing as every page on the site.
  return <StudioFrame>{children}</StudioFrame>;
}

function StudioFrame({ children }: { children: React.ReactNode }) {
  const t = useTranslations("studio");

  return (
    <AreaShell
      title={t("title")}
      // Labelled here rather than in the rail, so the lookups happen on the
      // server and the client bundle gets the section names instead of a
      // catalogue.
      links={STUDIO_LINKS.map(({ key, href, role }) => ({
        href,
        role,
        label: t(`sections.${key}.title`),
      }))}
    >
      {children}
    </AreaShell>
  );
}
