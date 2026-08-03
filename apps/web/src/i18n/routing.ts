import { defineRouting } from "next-intl/routing";

/**
 * The single source of truth for which languages the site ships. Adding one here
 * is all the routing, middleware and locale switcher need — every other piece
 * derives from `routing.locales` rather than repeating the list.
 */
export const routing = defineRouting({
  locales: ["uk", "en"],
  defaultLocale: "uk",
  // Every page carries its locale in the path (/uk/…, /en/…). The alternative —
  // leaving the default locale unprefixed — makes `/` ambiguous to crawlers and
  // to the edge cache, and the ISR read path in docs/ROADMAP.md depends on one
  // canonical URL per language.
  localePrefix: "always",
  // Ukrainian is the site's language, not a preference to be negotiated. Left
  // on, the middleware reads `Accept-Language` (and the NEXT_LOCALE cookie) and
  // sends a reader with an English browser from `/` to `/en`, so `defaultLocale`
  // would only ever apply to visitors who match neither. Off, `/` always means
  // `/uk` and English is something the reader opts into via the switcher —
  // which is also what keeps `/` a single cacheable redirect rather than one
  // that varies per request.
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

/**
 * A language is always named in its own language, so these labels read the same
 * whichever locale is active — which is exactly why they live here and not in
 * `messages/`.
 *
 * `short` is deliberately not the route segment: `uk` is the correct ISO 639-1
 * code for Ukrainian and stays in the URL, but as a *label* "UK" reads as the
 * United Kingdom, so the switcher shows "UA". Both labels are Latin because the
 * nav's IM Fell English SC ships no Cyrillic and would silently fall back.
 */
export const localeNames: Record<Locale, { short: string; full: string }> = {
  uk: { short: "UA", full: "Українська" },
  en: { short: "EN", full: "English" },
};
