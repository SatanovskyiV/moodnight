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
          <li key={locale} className="flex items-center">
            {/* The divider between the two languages. It was a `border-l` on
                this `<li>` until the links grew a 44px touch target, at which
                point the border grew with them and a hairline meant to sit
                between two words became a rule the height of the bar. As its
                own element it is sized in `em` off the text it separates and
                stays that hairline whatever the target around it is doing. */}
            {index > 0 && (
              <span aria-hidden="true" className="bg-primary-deep/50 mx-2 h-[1.1em] w-px" />
            )}

            {/* The active language needs no styling of its own: `NavLink` lights
                up whatever carries `aria-current`, so the state is declared once
                and only in the place a screen reader also reads it. */}
            <NavLink asChild variant="compact" className="px-1">
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
