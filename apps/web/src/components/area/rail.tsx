"use client";

import { hasRole } from "@moodnight/shared";
import { useTranslations } from "next-intl";

import { Sigil } from "@/components/editorial/ornaments";
import { useSession } from "@/components/session";
import { NavLink } from "@/components/top-nav/nav-link";
import { Link, usePathname } from "@/i18n/navigation";

import type { LabelledAreaLink } from "./links";

/**
 * An area's own navigation: a sticky column beside the content on a desktop, a
 * scrolling strip above it on a phone.
 *
 * It shows only what the reader may open — an editor in `/admin` sees the queue
 * and nothing else — reading the same `role` column the gate reads, so the rail
 * and the door always agree. Hiding a row is a courtesy rather than a defence:
 * typing the address instead reaches `RequireRole`, and the endpoint behind it
 * reaches `RolesGuard`.
 *
 * The links wear `NavLink`, the top bar's own treatment, because they are the
 * same kind of thing and the prototype styles every navigation link alike
 * (prototype/styles.css:216-228). That is also what makes `aria-current` light
 * the reader's own page in gold for free — the rule is already in that
 * component, waiting for something to supply the attribute. This is that
 * something.
 *
 * `badges` is how a section says something about itself in the rail — the queue
 * hands over how many poems are waiting — keyed by the href it belongs beside.
 * A node and not a number, because the rail must not learn to count: the mark is
 * whatever the area handed it, and only the area knows what it costs to know.
 * Optional, so the studio passes nothing and looks exactly as it did.
 */
export function AreaRail({
  title,
  links,
  badges,
}: {
  title: string;
  links: LabelledAreaLink[];
  badges?: Record<string, React.ReactNode>;
}) {
  const t = useTranslations("roles");
  const pathname = usePathname();
  const { state } = useSession();

  // Unreachable: the rail only renders inside the granted branch of the gate, so
  // the session is signed in by construction. Restated here because that is a
  // guarantee about the tree and not one the type system can see, and returning
  // an empty rail is the honest thing to do if it ever stops holding.
  if (state.status !== "signedIn") {
    return null;
  }

  const { role } = state.session.user;
  const visible = links.filter((link) => hasRole(role, link.role));

  return (
    <nav
      aria-label={title}
      className="compact:sticky compact:top-24 compact:self-start compact:flex-col compact:gap-8 compact:border-r compact:border-b-0 compact:pr-8 compact:pb-0 border-primary/15 flex flex-col gap-5 border-b pb-5"
    >
      <p className="font-display text-foreground tracking-display text-label flex items-center gap-3 uppercase">
        <span className="text-primary drop-shadow-glow shrink-0">
          <Sigil size={18} />
        </span>
        {title}
      </p>

      {/* Below the prototype's own 720px the column lies down and scrolls
          sideways, because a phone cannot spend a third of its width on
          navigation. It scrolls inside the content column rather than bleeding
          to the screen edges, so the row and the hairline under this whole block
          end at the same place and a label cut off at that edge reads as more to
          come rather than as a layout that overflowed. */}
      <ul className="compact:flex-col compact:gap-1 compact:overflow-visible flex gap-6 overflow-x-auto">
        {visible.map(({ href, label }) => (
          <li key={href} className="flex shrink-0 items-center gap-2">
            <NavLink
              asChild
              // Exact, not prefix: with `/studio` in the same list as
              // `/studio/poems`, a prefix test would mark the overview current
              // on every page of the area. A nested route not in the table
              // therefore lights nothing, which is the truthful answer — none of
              // these rows is the page you are on.
              aria-current={pathname === href ? "page" : undefined}
            >
              <Link href={href}>{label}</Link>
            </NavLink>

            {/* Beside the link and never inside it: the link's accessible name
                is the section, and a count folded into it would make the name
                change every time somebody submitted a poem. */}
            {badges?.[href]}
          </li>
        ))}
      </ul>

      {/* The reader's standing, at the foot of the rail — which is where the
          question "why is the rest of this list not here?" gets asked, and so
          where its answer belongs. Only in the column: the phone's strip is one
          scrolling row and has nowhere to put a footnote. */}
      <p className="font-caps text-parchment-faint text-micro tracking-label compact:block hidden uppercase">
        {t(role)}
      </p>
    </nav>
  );
}
