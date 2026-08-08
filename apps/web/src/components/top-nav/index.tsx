import { useTranslations } from "next-intl";

import { Sigil } from "@/components/editorial/ornaments";
import { Link } from "@/i18n/navigation";

import { AuthAction } from "./auth-action";
import { LocaleSwitcher } from "./locale-switcher";
import { NAV_LINKS } from "./nav-links";
import { NavLink } from "./nav-link";

/**
 * Ported from prototype/app.jsx:65-81, styled from prototype/styles.css:177-228.
 *
 * A Server Component. Two children are interactive and carry their own
 * "use client" boundaries — the locale switcher, and the auth control, which
 * cannot be rendered on the server at all because only the browser can tell
 * whether anybody is signed in (see `SessionProvider`). Everything else, the
 * wordmark and the section links and the message lookups behind them, stays out
 * of the client bundle.
 *
 * Sticky, so the bar rides along on every route. `z-20` rather than the `z-10`
 * the page `<main>`s carry: the bar renders first, so at an equal z-index the
 * content scrolling underneath would paint over it.
 *
 * The bar is one row at every width and never wraps, which is what the three
 * widths below are for. The language switcher and the sign-in button are the
 * part that always stays — a reader has to be able to change language and to
 * sign in from anywhere. Everything else gives way to them in turn: the section
 * links first, then the wordmark.
 */
export function TopNav() {
  const t = useTranslations("nav");

  return (
    <nav
      aria-label={t("label")}
      className="border-primary/15 from-background/85 to-background/60 compact:px-8 compact:py-6 sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-gradient-to-b px-5 py-3 backdrop-blur-[8px]"
    >
      {/* The wordmark warms to gold on hover like every other link in the bar:
          in the prototype `.topnav a:hover` (styles.css:225) outranks the
          `.brand` colour, so the brand is not an exception there either — hence
          the same `NavLink`, in its brand variant. The sigil keeps its own gold:
          `.sigil`'s colour rule wins over the anchor's, so it does not shift
          with the label. */}
      <NavLink
        asChild
        variant="brand"
        className="compact:gap-[0.8rem] flex shrink-0 items-center gap-[0.6rem]"
      >
        <Link href="/" aria-label={t("home")}>
          {/* 28px flat, as in the prototype — not `size-7`, which is 1.75rem and
              so 31.5px against this page's 18px root. */}
          <span className="text-primary drop-shadow-glow grid size-[28px] shrink-0 place-items-center">
            <Sigil size={26} />
          </span>
          {/* On a phone the sigil carries the brand alone: the word set in
              Cinzel at 0.3em is the widest thing in the bar, and something has
              to give before the sign-in button is the piece pushed off the
              edge. `sr-only` rather than `hidden` so it goes on being the
              anchor's visible-text match for speech input; the accessible name
              never moved, because `aria-label` on the link already owns it. */}
          <span className="narrow:not-sr-only sr-only">MoodNight</span>
        </Link>
      </NavLink>

      {/* The prototype drops the section links below 720px
          (prototype/styles.css:958-961). Here they go at 1024px instead: four
          labels in IM Fell at 0.15em are around 450px of the row on their own,
          and against the wordmark and the two controls that is more than a
          720px tablet has to give — the prototype's own bar overflows there.
          Same intent as its rule, moved to where the type actually fits.

          What this leaves is a tablet with no route to the sections. That is
          nothing today, because these are still same-page anchors into a page
          with no such sections (see ./nav-links.ts); the moment Phase 2 makes
          them routes they need a menu behind a button at these widths, and that
          is the phase to build it in. */}
      <div className="compact:gap-[1.2rem] flex items-center gap-3 lg:gap-10">
        <ul className="hidden items-center gap-6 lg:flex xl:gap-10">
          {NAV_LINKS.map(({ key, href }) => (
            <li key={key}>
              <NavLink href={href}>{t(key)}</NavLink>
            </li>
          ))}
        </ul>

        <LocaleSwitcher />

        <AuthAction />
      </div>
    </nav>
  );
}
