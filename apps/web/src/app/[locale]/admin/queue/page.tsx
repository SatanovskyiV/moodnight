import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AreaHeading } from "@/components/area/heading";
import { Restoring } from "@/components/session/gate";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

import { QueueTable } from "./queue-table";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: "admin.sections.queue" });

  return { title: t("title") };
}

/**
 * `EDITOR` and above — the gentlest floor in the administration, and the row
 * that opens the area to anybody below an admin at all. Declared in
 * components/area/links.ts and enforced by the shell, not here.
 *
 * It is the one page in this area whose gate and whose endpoint agree exactly:
 * `GET /admin/queue` is `@Roles("EDITOR")` and so is this row. The names next
 * door are the pair that differ, deliberately.
 */
export default async function AdminQueuePage(props: LocaleParams) {
  await resolveLocale(props);

  return <AdminQueue />;
}

/**
 * Split out because `useTranslations` is a hook and the page has to be async to
 * await its params — the same pairing as every page on the site, and the same
 * division of labour as the names: the heading is a title and a lede, identical
 * for every editor, and has no business in a bundle.
 *
 * The Suspense boundary is for `useSearchParams`, which the table reaches
 * through `useListQuery`; the fallback is the rite the table itself shows while
 * its first page is in flight, so nothing on screen changes at the hand-over.
 */
function AdminQueue() {
  const t = useTranslations("admin.sections.queue");

  return (
    <section className="flex flex-col gap-8">
      <AreaHeading title={t("title")} line={t("line")} />

      <Suspense fallback={<Restoring className="flex" label={t("loading")} />}>
        <QueueTable />
      </Suspense>
    </section>
  );
}
