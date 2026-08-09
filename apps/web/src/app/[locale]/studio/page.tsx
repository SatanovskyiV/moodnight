import { redirect } from "@/i18n/navigation";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

/**
 * The studio has one section, so its front door is that section.
 *
 * There is no overview page while there is nothing to overview — the poems are
 * the only thing in here — and an area whose rail holds a single row should not
 * answer its own address with a placeholder telling the reader to click the one
 * link beside it. `/studio` is what the user menu offers and what the roadmap
 * names as the area, so the address stays; it just arrives somewhere real.
 *
 * `redirect` is next-intl's, which needs the locale spelled out because a Server
 * Component cannot read it back off the request — `resolveLocale` has it, having
 * just narrowed the segment.
 *
 * When the area grows a second section this file becomes the overview again and
 * `STUDIO_LINKS` grows the row that points at it.
 */
export default async function StudioPage(props: LocaleParams) {
  const locale = await resolveLocale(props);

  redirect({ href: "/studio/poems", locale });
}
