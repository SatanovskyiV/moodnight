import { ROLE_RANK, type UserRole } from "@moodnight/shared";

/**
 * One section of an area: where it lives, what it is called, and the lowest role
 * that may open it.
 *
 * `key` indexes the area's `sections` message namespace, the same contract
 * components/top-nav/nav-links.ts follows — a label change is a catalogue edit
 * and never a component edit, and a key that does not exist fails typecheck at
 * the `t(...)` that reads it.
 */
export type AreaLink = {
  key: string;
  href: string;
  role: UserRole;
};

/** An {@link AreaLink} with its label already looked up, which is how the rail
 * receives it: the layouts are Server Components and know their namespace
 * literally, so the message lookups stay out of the client bundle. */
export type LabelledAreaLink = Omit<AreaLink, "key"> & { label: string };

/**
 * The author's own workshop — every signed-in account has one, because `AUTHOR`
 * is the role a registration gets by default and the bottom of the ladder.
 *
 * Called the studio and not "editor" on purpose: `EDITOR` in this codebase is
 * the queue moderator, one rung up and an *admin*-area role. Anyone who can post
 * belongs here; only somebody who judges what others post belongs there.
 *
 * One section for now — the responses and the echoes are Phase 5 work and the
 * overview has nothing to overview until they exist, so the rail lists what is
 * actually there rather than three doors onto the same placeholder. `/studio`
 * itself is a redirect to this row (app/[locale]/studio/page.tsx); when the area
 * grows a second section it gets its own overview page back.
 */
export const STUDIO_LINKS = [
  { key: "poems", href: "/studio/poems", role: "AUTHOR" },
] as const satisfies readonly AreaLink[];

/**
 * Running the site. Each row keeps its own floor, which is exactly the shape
 * `RolesGuard` gives the API — a controller sets a minimum and a single route
 * may raise it (apps/api/src/auth/roles.guard.ts). The two ladders are the same
 * `ROLE_RANK`, so what the rail offers and what the endpoint behind it accepts
 * cannot describe different sites.
 *
 * Two sections with two different floors, which is the arrangement this table
 * was built for and the first time it has had one. The area's own floor is now
 * `EDITOR`, computed from the queue rather than declared anywhere ({@link
 * areaFloor}), so an editor belongs in the administration on the strength of the
 * queue alone and meets `RequireRole` again at the names — inside the frame,
 * with the rail beside them. Both gates are in components/area/shell.tsx, and
 * until this row existed the inner one had nothing to refuse.
 *
 * The queue goes first because it is what the area opens on: app/[locale]/admin
 * redirects to the gentlest section rather than to a fixed one, so everybody who
 * may stand in the hall lands on a door they may open.
 */
export const ADMIN_LINKS = [
  { key: "queue", href: "/admin/queue", role: "EDITOR" },
  { key: "users", href: "/admin/users", role: "ADMIN" },
] as const satisfies readonly AreaLink[];

/**
 * The lowest role that may see `pathname`, according to the tables above.
 *
 * **This is why no page carries a gate of its own.** The shell asks this once,
 * per navigation, and hands the answer to `RequireRole`; the rail filters its
 * own rows against the same column. One declaration, so a section cannot be
 * hidden from the rail and still open to anybody who types the address.
 *
 * The longest matching prefix wins, so a nested route inherits its section's
 * floor — `/admin/users/:id` is an admin page without needing a row. A path that
 * matches nothing at all falls back to the *strictest* role in the table rather
 * than the area's floor: a page with no row is a page somebody forgot to
 * declare, and failing closed makes that visible on the first visit instead of
 * quietly leaving it open.
 */
export function minimumRole(
  links: readonly Pick<AreaLink, "href" | "role">[],
  pathname: string,
): UserRole {
  let matched: Pick<AreaLink, "href" | "role"> | undefined;

  for (const link of links) {
    const covers = pathname === link.href || pathname.startsWith(`${link.href}/`);

    if (covers && (!matched || link.href.length > matched.href.length)) {
      matched = link;
    }
  }

  if (matched) {
    return matched.role;
  }

  return links.reduce<UserRole>(
    (strictest, link) => (ROLE_RANK[link.role] > ROLE_RANK[strictest] ? link.role : strictest),
    "AUTHOR",
  );
}

/**
 * The lowest role that belongs in an area at all: the gentlest floor any of its
 * sections keeps.
 *
 * Somebody who may open one door may stand in the hall — an editor belongs in
 * the administration on the strength of the queue alone, even though the names
 * and the hearth are shut to them. That is the floor the shell's outer gate
 * takes, and the one the user menu asks before offering the door.
 *
 * Computed rather than declared, so it cannot drift: the areas no longer carry a
 * row for their own address (each redirects to its single section for now), and
 * the alternative — letting `minimumRole` fall through to its fail-closed
 * `ROOT` — would shut an editor out of the whole area the day the hearth is
 * added back. A section is what an area is made of, so a section is what its
 * floor is read from.
 */
export function areaFloor(links: readonly Pick<AreaLink, "role">[]): UserRole {
  return links.reduce<UserRole>(
    (gentlest, link) => (ROLE_RANK[link.role] < ROLE_RANK[gentlest] ? link.role : gentlest),
    "ROOT",
  );
}
