import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

import { Review } from "./review";

export async function generateMetadata(props: LocaleParams<{ id: string }>): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: "admin.sections.queue.review" });

  // The poem's own title would be the better tab, and cannot be had: this page
  // is built for everybody and the poem arrives over an authenticated call in
  // the browser. So the tab names the act rather than its subject.
  return { title: t("title") };
}

/**
 * The first dynamic segment on the site, and the empty list is deliberate.
 *
 * Nothing rendered on the server here depends on the id — the heading, the back
 * link and a reference to a client component are the same bytes for every poem —
 * so returning `[]` with `dynamicParams` left at its default opts the segment
 * into generating each path on demand and then keeping it. One render per id
 * ever, instead of one per request, which is the cost model docs/ROADMAP.md is
 * built on applied to a route whose ids cannot be known at build time.
 */
export function generateStaticParams() {
  return [];
}

/**
 * Reading one poem out of the queue, and answering it.
 *
 * `EDITOR` and above, and there is no gate in this file. `minimumRole` in
 * components/area/links.ts matches the longest `href` prefix, so this address
 * inherits `/admin/queue`'s floor and `AreaShell` has already put a
 * `RequireRole` around it — one declaration for a section and everything nested
 * beneath it, the same inheritance app/[locale]/studio/poems/new/page.tsx
 * documents. What the browser shows is chrome either way; `RolesGuard` on
 * `PoemReviewController` is what decides.
 *
 * `params` is awaited twice — once inside `resolveLocale` and once for the id.
 * It is one promise and Next caches it, so the second await is free and reads
 * better than threading the resolved object through.
 */
export default async function QueueReviewPage(props: LocaleParams<{ id: string }>) {
  await resolveLocale(props);

  const { id } = await props.params;

  return <QueueReview id={id} />;
}

/**
 * Split out because `useTranslations` is a hook and the page has to be async to
 * await its params — the same pairing as every page on the site.
 *
 * No `AreaHeading`: this page's heading is the poem's own title, which only the
 * client knows. What the server can say is where the reader came from, so the
 * way back is the one thing rendered above the boundary — and it is there before
 * the poem is, which is what makes it useful on a request that fails.
 */
function QueueReview({ id }: { id: string }) {
  const t = useTranslations("admin.sections.queue.review");

  return (
    <section className="flex flex-col gap-8">
      <Link
        href="/admin/queue"
        className="font-caps text-muted-foreground hover:text-primary focus-visible:text-primary text-micro tracking-label focus-visible:outline-ring inline-flex w-fit items-center gap-2 uppercase transition-colors duration-300 outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        {t("back")}
      </Link>

      <Review id={id} />
    </section>
  );
}
