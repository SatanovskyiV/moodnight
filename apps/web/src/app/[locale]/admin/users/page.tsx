import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AreaHeading } from "@/components/area/heading";
import { Restoring } from "@/components/session/gate";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

import { UsersTable } from "./users-table";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: "admin.sections.users" });

  return { title: t("title") };
}

/**
 * `ADMIN` and above, which is declared in components/area/links.ts and enforced
 * by the shell — not here. The endpoint behind the table is one rung gentler
 * (`@Roles("EDITOR")`), and now that the queue has opened the area at `EDITOR`
 * this is the page where that difference is visible: an editor passes the
 * frame's gate, is refused at this section's, and meets «Не твій поріг» with the
 * rail still beside them and the queue one row away. That is the two-gate
 * arrangement in components/area/shell.tsx doing exactly what it was written
 * for. The looser guard on `GET /users` is the API's own business and stays as
 * it is: what an editor may fetch by hand is not what the administration offers
 * them a door to.
 */
export default async function AdminUsersPage(props: LocaleParams) {
  await resolveLocale(props);

  return <AdminUsers />;
}

/**
 * Split out because `useTranslations` is a hook and the page has to be async to
 * await its params — the same pairing as every page on the site.
 *
 * The heading is rendered here, on the server, and only the table is a client
 * island: a title and a lede are the same for every reader and have no business
 * in a bundle.
 *
 * The Suspense boundary is for `useSearchParams`, which the table reaches
 * through `useListQuery`. As things stand it would very likely never trigger a
 * bailout — `RequireRole` renders the door instead of `children` during the
 * prerender, so the table's function is never called on the server — but that is
 * a fact about the gate rather than a guarantee of the framework, and the
 * boundary costs a component that is never rendered. The fallback is the same
 * rite the table shows while its first page is in flight, so nothing changes on
 * screen when one hands over to the other.
 */
function AdminUsers() {
  const t = useTranslations("admin.sections.users");

  return (
    <section className="flex flex-col gap-8">
      <AreaHeading title={t("title")} line={t("line")} />

      <Suspense fallback={<Restoring className="flex" label={t("loading")} />}>
        <UsersTable />
      </Suspense>
    </section>
  );
}
