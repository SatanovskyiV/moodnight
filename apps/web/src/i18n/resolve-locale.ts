import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing, type Locale } from "./routing";

/**
 * The props shape of every route segment under `app/[locale]`.
 *
 * The parameter is what a nested dynamic segment adds to it —
 * `LocaleParams<{ id: string }>` for `app/[locale]/admin/queue/[id]`. It is a
 * parameter rather than an intersection at the call site because `params` is a
 * promise: `LocaleParams & { params: Promise<{ id: string }> }` gives a property
 * typed `Promise<A> & Promise<B>`, which awaits to `A` alone under TypeScript's
 * overload resolution and would quietly lose the id.
 *
 * The default is `Record<never, never>` and not `{}` — the latter is the "any
 * non-nullish value" type and would let anything through here — so every
 * existing page keeps compiling with no type argument at all. {@link
 * resolveLocale} needs no parameter of its own either: `Promise` is covariant,
 * so a params promise carrying more than the locale is still assignable to one
 * carrying only it.
 */
export type LocaleParams<Params = Record<never, never>> = {
  params: Promise<{ locale: string } & Params>;
};

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
