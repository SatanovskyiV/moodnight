import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AreaPlaceholder } from "@/components/area/placeholder";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: "admin.sections.users" });

  return { title: t("title") };
}

/**
 * `ADMIN` and above, which is declared in components/area/links.ts and enforced
 * by the shell — not here. An editor who types this address gets the refusal
 * panel from the same row that kept the section out of their rail, and the
 * `GET /users` behind it would refuse them too.
 */
export default async function AdminUsersPage(props: LocaleParams) {
  await resolveLocale(props);

  return <AdminUsers />;
}

function AdminUsers() {
  const t = useTranslations("admin.sections.users");

  return <AreaPlaceholder title={t("title")} line={t("line")} />;
}
