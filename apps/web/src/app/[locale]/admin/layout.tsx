import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { ADMIN_LINKS } from "@/components/area/links";
import { AreaShell } from "@/components/area/shell";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: "admin" });

  return { title: { default: t("title"), template: `%s · ${t("title")}` } };
}

/**
 * Running the site.
 *
 * Its sections keep their own floors in `ADMIN_LINKS` — the names, for now, are
 * the only one, and an admin's. Nothing about that ladder is repeated here: the
 * shell reads the table, the rail filters against it, and `RolesGuard` on the
 * API enforces the same `ROLE_RANK` on every request the pages will eventually
 * make. That is also why adding the queue back is one row and not an edit here.
 */
export default async function AdminLayout({
  children,
  ...props
}: LocaleParams & { children: React.ReactNode }) {
  await resolveLocale(props);

  return <AdminFrame>{children}</AdminFrame>;
}

function AdminFrame({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin");

  return (
    <AreaShell
      title={t("title")}
      links={ADMIN_LINKS.map(({ key, href, role }) => ({
        href,
        role,
        label: t(`sections.${key}.title`),
      }))}
    >
      {children}
    </AreaShell>
  );
}
