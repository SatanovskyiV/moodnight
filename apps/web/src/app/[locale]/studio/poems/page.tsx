import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AreaHeading } from "@/components/area/heading";
import { Restoring } from "@/components/session/gate";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

import { StudioPoemsTable } from "./poems-table";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: "studio.sections.poems" });

  return { title: t("title") };
}

/**
 * The studio's one section, and no longer a placeholder: an author's own poems,
 * every state they can be in.
 *
 * `AUTHOR` and above, which is everybody who can sign in at all — the role a
 * registration gets by default. Declared in components/area/links.ts and
 * enforced by the shell, so this file carries no gate, and the endpoint behind
 * it needs none either: `GET /studio/poems` is scoped to the token's own id, so
 * the worst an unexpected caller can do is read their own shelf.
 */
export default async function StudioPoemsPage(props: LocaleParams) {
  await resolveLocale(props);

  return <StudioPoems />;
}

/**
 * Split out because `useTranslations` is a hook and the page has to be async to
 * await its params — the same pairing as every page on the site, and the same
 * division of labour as the queue: the heading is a title and a lede, identical
 * for every author, and has no business in a bundle.
 *
 * The button stays with the heading rather than moving into the table's empty
 * state, so it is there for an author with forty poems as well as for one with
 * none. It is what the placeholder this page replaced was holding open, and
 * `/studio/poems/new` is still reachable no other way.
 *
 * The Suspense boundary is for `useSearchParams`, which the table reaches
 * through `useListQuery`; the fallback is the rite the table itself shows while
 * its first page is in flight, so nothing on screen changes at the hand-over.
 */
function StudioPoems() {
  const t = useTranslations("studio.sections.poems");

  return (
    <section className="flex flex-col gap-8">
      <AreaHeading
        title={t("title")}
        line={t("line")}
        action={
          <Button asChild className="compact:px-8 px-5 whitespace-normal">
            <Link href="/studio/poems/new">{t("write")}</Link>
          </Button>
        }
      />

      <Suspense fallback={<Restoring className="flex" label={t("loading")} />}>
        <StudioPoemsTable />
      </Suspense>
    </section>
  );
}
