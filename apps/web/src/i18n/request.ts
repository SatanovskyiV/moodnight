import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

/**
 * Resolves the message catalogue for one request.
 *
 * `[locale]` acts as a catch-all for unmatched paths, so `requestLocale` can be
 * an unknown value or `undefined` — it has to fall back rather than throw, and
 * `hasLocale` is what narrows it to a real locale.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Every date on this site belongs to the same group of poets in the same
    // place, so they are all told in that place's time rather than in each
    // reader's. Without this, next-intl falls back to whatever the runtime
    // happens to be in — UTC in a Vercel function, the reader's own zone in the
    // browser — and the same timestamp could be rendered as two different days
    // by the server and by the component that re-renders it.
    timeZone: "Europe/Kyiv",
  };
});
