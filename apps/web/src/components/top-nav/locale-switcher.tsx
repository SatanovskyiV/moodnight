"use client";

import { useLocale, useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { localeNames, routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

import { NavLink } from "./nav-link";

/**
 * A client component for one reason: it needs the current pathname, because
 * switching language should re-render the page the reader is already on rather
 * than drop them back at the home page. It is the only interactive part of the
 * bar, so it carries the whole client boundary on its own.
 *
 * `usePathname` here is the locale-aware one from `@/i18n/navigation` — it
 * returns the path *without* the prefix, so handing that back to `Link` with a
 * `locale` gives /uk/authors → /en/authors rather than stacking prefixes.
 *
 * These are anchors and not buttons deliberately: each language stays
 * right-clickable, shareable and crawlable, and `hrefLang` tells a crawler what
 * it will find on the other end.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations("localeSwitcher");
  const pathname = usePathname();
  const activeLocale = useLocale();

  return (
    <ul aria-label={t("label")} className={cn("flex items-center", className)}>
      {routing.locales.map((locale, index) => {
        const { short, full } = localeNames[locale];

        return (
          <li
            key={locale}
            className={index > 0 ? "border-primary-deep/50 ml-2 border-l pl-2" : undefined}
          >
            {/* The active language needs no styling of its own: `NavLink` lights
                up whatever carries `aria-current`, so the state is declared once
                and only in the place a screen reader also reads it. */}
            <NavLink asChild variant="compact">
              <Link
                href={pathname}
                locale={locale}
                hrefLang={locale}
                lang={locale}
                aria-current={locale === activeLocale ? "true" : undefined}
              >
                {short}
                {/* Keeps the visible "UA" as part of the accessible name (so
                    speech input still matches it) while a screen reader
                    announces the language in full, and in its own language
                    via `lang`. */}
                <span className="sr-only"> {full}</span>
              </Link>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}
