import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { ADMIN_LINKS } from "@/components/area/links";
import { AreaShell } from "@/components/area/shell";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

import { Waiting } from "./queue/waiting";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: "admin" });

  return { title: { default: t("title"), template: `%s · ${t("title")}` } };
}

/**
 * Running the site.
 *
 * Its sections keep their own floors in `ADMIN_LINKS` — the queue's is `EDITOR`
 * and the names' is `ADMIN`, so the area now has the ladder it was shaped for.
 * Nothing about it is repeated here: the shell reads the table, the rail filters
 * against it, and `RolesGuard` on the API enforces the same `ROLE_RANK` on every
 * request the pages make. Adding the queue was one row in that table and no edit
 * here, which was the point of putting it there.
 *
 * The one thing a section says about itself here is the queue's count, handed to
 * the shell as a badge against its href. It is a client component and it is
 * *this* file's import rather than the rail's, because the rail is both areas'
 * and the studio has nothing to count — the frame carries marks, the area
 * decides which.
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
      // Keyed by the href in `ADMIN_LINKS` rather than by a section name, which
      // is what makes an unwired badge visible: a typo here draws nothing beside
      // anything instead of quietly attaching to the wrong row.
      badges={{ "/admin/queue": <Waiting /> }}
    >
      {children}
    </AreaShell>
  );
}
