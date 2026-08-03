import type uk from "./messages/uk.json";
import type { routing } from "./src/i18n/routing";

/**
 * Teaches next-intl about this app specifically: `useTranslations` then
 * autocompletes real message keys and rejects typos, and `Locale` narrows to the
 * two languages we ship instead of `string`.
 *
 * Ukrainian is the reference catalogue — it is the language the site is written
 * in, and English is the translation of it. What keeps English from drifting
 * away from it is the assertion in `src/i18n/catalogues.ts`, which has to sit in
 * a real module because `skipLibCheck` exempts this file from checking.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof uk;
  }
}
