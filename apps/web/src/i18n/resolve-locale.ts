import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing, type Locale } from "./routing";

/**
 * The props shape of every route segment under `app/[locale]`.
 */
export type LocaleParams = { params: Promise<{ locale: string }> };

/**
 * The two things each layout and page under `[locale]` has to do before it can
 * render, in one call so they cannot drift apart:
 *
 * 1. Narrow the segment. `[locale]` is effectively a catch-all — `/nonsense`
 *    matches it — so the value is `string` until `hasLocale` proves otherwise,
 *    and anything else must 404 rather than render half-translated.
 * 2. Opt the tree into static rendering. Skip `setRequestLocale` and next-intl
 *    falls back to dynamic rendering, which quietly drops the page out of the
 *    cached read path docs/ROADMAP.md depends on.
 *
 * Kept out of `routing.ts` on purpose: that module is imported by the edge
 * middleware and must not pull in `next/navigation`.
 */
export async function resolveLocale({ params }: LocaleParams): Promise<Locale> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return locale;
}
