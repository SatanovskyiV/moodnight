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
  };
});
