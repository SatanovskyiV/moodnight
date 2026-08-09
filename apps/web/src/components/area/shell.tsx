"use client";

import { RequireRole } from "@/components/session/gate";
import { usePathname } from "@/i18n/navigation";

import { areaFloor, minimumRole, type LabelledAreaLink } from "./links";
import { AreaRail } from "./rail";

/**
 * The frame both the studio and the administration are: a rail of sections, the
 * page beside it, and gates around each.
 *
 * `children` is the page, prerendered by the server layout above and passed
 * straight through — the same arrangement the home page's `Welcome` uses, and
 * for the same reason. This component has to be a client one, because the only
 * place the answer to "who is reading" exists is the browser (see
 * `SessionProvider`); routing the page *through* it rather than building it here
 * is what keeps that from dragging the whole area into the client bundle.
 *
 * **Two gates, not one, and the difference is what an editor sees at
 * `/admin/users`.** The outer one keeps the area's own floor: below it there is
 * no frame at all, because somebody who may not be here should not be handed a
 * rail full of doors. The inner one keeps the section's, which may be higher —
 * so a reader who belongs in the area but not on this page is refused *inside*
 * it, with the rail still beside them and a way on rather than only a way out.
 * While an area has a single section the two are the same row and the inner gate
 * never fires; once the administration has its ladder back it is the whole point
 * of it.
 *
 * Both floors come from the links table rather than from props, so an area's
 * shape is declared in exactly one file — the frame's from {@link areaFloor},
 * the page's from the row that covers the address. `usePathname` is next-intl's,
 * which strips the locale prefix — that is what lets the table hold plain
 * `/admin/users` rather than one row per language.
 */
export function AreaShell({
  title,
  links,
  children,
}: {
  title: string;
  links: LabelledAreaLink[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    // `relative z-10` is not decoration: the parchment noise and the vignette
    // are fixed overlays on `body::before/after` at z-index 1 and 2
    // (app/globals.css), so anything that does not lift itself above them is
    // rendered *under* the vignette and reads as dimmed at the corners. Every
    // `<main>` on the site carries this.
    <main className="max-w-page compact:px-8 compact:py-14 relative z-10 mx-auto w-full px-5 py-8">
      <RequireRole role={areaFloor(links)}>
        {/* A column on a phone — rail above, page below — and two tracks once
            there is room for them. `minmax(0,1fr)` rather than `1fr` so that a
            wide child (a table, a long unbroken line of a poem) scrolls inside
            its own box instead of stretching the track and pushing the rail off
            the screen. */}
        <div className="compact:grid compact:grid-cols-[14rem_minmax(0,1fr)] compact:gap-10 compact:items-start flex flex-col gap-6">
          <AreaRail title={title} links={links} />

          <div className="min-w-0">
            <RequireRole role={minimumRole(links, pathname)}>{children}</RequireRole>
          </div>
        </div>
      </RequireRole>
    </main>
  );
}
