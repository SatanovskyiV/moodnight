import { useTranslations } from "next-intl";

import { Sigil } from "@/components/editorial/ornaments";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

import { LocaleSwitcher } from "./locale-switcher";
import { NAV_LINKS } from "./nav-links";
import { NavLink } from "./nav-link";

/**
 * Ported from prototype/app.jsx:65-81, styled from prototype/styles.css:177-228.
 *
 * A Server Component. Nothing in the bar is interactive except the locale
 * switcher, so that child alone carries the "use client" boundary and every
 * message lookup here stays out of the client bundle.
 */
export function TopNav() {
  const t = useTranslations("nav");

  return (
    <nav
      aria-label={t("label")}
      className="border-primary/15 from-background/85 to-background/60 relative z-10 flex items-center justify-between border-b bg-gradient-to-b px-8 py-6 backdrop-blur-[8px]"
    >
      {/* The wordmark warms to gold on hover like every other link in the bar:
          in the prototype `.topnav a:hover` (styles.css:225) outranks the
          `.brand` colour, so the brand is not an exception there either — hence
          the same `NavLink`, in its brand variant. The sigil keeps its own gold:
          `.sigil`'s colour rule wins over the anchor's, so it does not shift
          with the label. */}
      <NavLink asChild variant="brand" className="flex items-center gap-[0.8rem]">
        <Link href="/" aria-label={t("home")}>
          {/* 28px flat, as in the prototype — not `size-7`, which is 1.75rem and
              so 31.5px against this page's 18px root. */}
          <span className="text-primary drop-shadow-glow grid size-[28px] place-items-center">
            <Sigil size={26} />
          </span>
          <span>MoodNight</span>
        </Link>
      </NavLink>

      {/* Below 720px the prototype drops the section links and keeps only the
          actions, tightening the row's gap (prototype/styles.css:958-961). */}
      <div className="compact:gap-10 flex items-center gap-[1.2rem]">
        <ul className="compact:flex hidden items-center gap-10">
          {NAV_LINKS.map(({ key, href }) => (
            <li key={key}>
              <NavLink href={href}>{t(key)}</NavLink>
            </li>
          ))}
        </ul>

        <LocaleSwitcher />

        <Button asChild variant="ghost" size="sm">
          <a href="#join">{t("signIn")}</a>
        </Button>
      </div>
    </nav>
  );
}
