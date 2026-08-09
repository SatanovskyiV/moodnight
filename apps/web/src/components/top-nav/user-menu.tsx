"use client";

import { hasRole, type User } from "@moodnight/shared";
import { useTranslations } from "next-intl";

import { ADMIN_LINKS, areaFloor } from "@/components/area/links";
import { Sigil, Spark } from "@/components/editorial/ornaments";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";

/**
 * The signed-in reader's own control in the top bar: who they are, the way into
 * their area, and the way out.
 *
 * A menu rather than two more links in the bar, for a reason of width. The bar
 * is already one row that gives up its section links at 1024px (see ./index.tsx),
 * and "Моє письмо" and "Врядування" in IM Fell at 0.15em are the two widest
 * things that could be added to it — inline, they would push the sign-out
 * control off a laptop, and the bar's width would start depending on the
 * reader's role. Behind a trigger they cost one fixed column whoever is looking.
 *
 * That fixed column is also what keeps the pre-paint swap still. `UserMenuStandIn`
 * below is the same shape with a sigil in it, so a returning member sees the
 * control they will end up with rather than one that resizes under the cursor
 * when the session finally lands. Nothing about it arrives late any more: the
 * reader's name is the menu's first row, not part of the trigger.
 */
export function UserMenu({
  user,
  onSignOut,
  isSigningOut,
}: {
  user: User;
  onSignOut: () => void;
  isSigningOut: boolean;
}) {
  const t = useTranslations("nav");
  const role = useTranslations("roles");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MenuTrigger className="flex" label={`${user.name} ${user.surname}`}>
          <Monogram user={user} />
        </MenuTrigger>
      </DropdownMenuTrigger>

      {/* Square corners and the auth card's own gradient, because a rounded,
          flat popover is the one shadcn default the theme's variables cannot
          correct on their own. `p-0` with the padding moved into the rows: a
          menu row in this design lights a surface and a rule at its own left
          edge, and a pad around the whole list would hold both off the frame. */}
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="border-primary/25 from-secondary/95 to-background/95 shadow-deep relative min-w-[16rem] rounded-none bg-gradient-to-b p-0 backdrop-blur-[10px]"
      >
        {/* The frame. A lit top edge that fades out before either corner, and
            four brackets set a few pixels inside the border, so the panel reads
            as something struck rather than something drawn — the same
            double-line logic the auth card gets from its seal and its rule.
            Purely decorative, and `pointer-events-none` so none of it interrupts
            the row underneath. */}
        <span
          aria-hidden="true"
          className="via-primary/60 pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent"
        />
        <Corner className="top-[4px] left-[4px] border-t border-l" />
        <Corner className="top-[4px] right-[4px] border-t border-r" />
        <Corner className="bottom-[4px] left-[4px] border-b border-l" />
        <Corner className="right-[4px] bottom-[4px] border-r border-b" />

        {/* Centred, like the auth card — this is the reader's own plate, and a
            plate is composed on an axis rather than ranged left. */}
        <DropdownMenuLabel className="flex flex-col items-center gap-[0.35rem] px-5 pt-[1.1rem] pb-3 text-center">
          <span className="font-display text-foreground tracking-display text-label leading-tight uppercase">
            {user.name} {user.surname}
          </span>
          {/* The decorative standing rather than the enum: "Ключник імен" is
              what the site calls an ADMIN everywhere a reader can see it, and
              this is the one place where knowing it explains why the next row is
              there at all. Between two sparks, the way the prototype punctuates
              an eyebrow — and pulled left by its own trailing letter-space, or
              the tracking would sit the right spark a couple of pixels further
              out than the left one. */}
          <span className="font-caps text-parchment-faint text-micro tracking-label flex items-center gap-2 uppercase">
            <Spark className="opacity-60" />
            <span className="-mr-[0.15em]">{role(user.role)}</span>
            <Spark className="opacity-60" />
          </span>
        </DropdownMenuLabel>

        {/* A rule with a bead on it rather than a plain hairline, because this
            is the one division in the menu that separates a kind of thing from
            another kind — who you are, from what you can do. The division
            further down is between two doors and keeps the plain line. */}
        <div aria-hidden="true" className="mx-4 mb-2 flex items-center gap-2">
          <span className="via-primary/30 h-px flex-1 bg-gradient-to-r from-transparent to-transparent" />
          <Spark className="opacity-70" />
          <span className="via-primary/30 h-px flex-1 bg-gradient-to-r from-transparent to-transparent" />
        </div>

        <MenuLink href="/studio">{t("myWriting")}</MenuLink>

        {/* The same floor the area itself keeps: the gentlest of its sections'
            (components/area/links.ts), asked rather than restated, so a door
            that appears here is a door that opens. Today that is `ADMIN`,
            because the names are the only section written; the queue arrives
            with Phase 4 and lets editors back in without an edit here. */}
        {hasRole(user.role, areaFloor(ADMIN_LINKS)) && (
          <MenuLink href="/admin">{t("administration")}</MenuLink>
        )}

        <DropdownMenuSeparator className="via-primary/20 mx-4 my-2 bg-gradient-to-r from-transparent to-transparent" />

        {/* Ember, not gold: leaving is the one row here that undoes something,
            and the palette already carries a warm colour for a thing going out.
            `destructive` is the blood red the theme keeps for real loss — a
            signed-out reader has lost nothing but the session. */}
        <MenuItem
          tone="ember"
          onSelect={onSignOut}
          disabled={isSigningOut}
          aria-busy={isSigningOut}
        >
          {isSigningOut ? t("signingOut") : t("signOut")}
        </MenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The trigger's shape while nobody can be named yet — during the pre-paint pass,
 * and for as long as `/auth/refresh` is in flight.
 *
 * A real button with nothing behind it, for the reason the sign-out button was
 * one before it: it is about to become the control, and a moment of dimmed,
 * un-clickable chrome would advertise a gap the reader is otherwise never shown.
 * The sigil stands in for initials because initials are a fact about a person
 * this render has not met.
 *
 * 18px, where the same glyph is 26 beside the wordmark: in the ring it is the
 * device on a seal rather than a mark standing on its own, and the size that
 * suits it is whatever leaves a clear round of ground between the two circles.
 */
export function UserMenuStandIn({ className }: { className?: string }) {
  const t = useTranslations("nav");

  return (
    <MenuTrigger className={className} label={t("account")}>
      <Sigil size={18} />
    </MenuTrigger>
  );
}

/**
 * The seal both controls are struck on: a gold ring with the reader's mark
 * inside it, on a faint wash of the same gold.
 *
 * A circle, where an earlier note in this file argued against a bordered tile —
 * and the two are not in conflict, because what makes a boxed control look
 * borrowed from another page is the box, not the frame. A ring is the shape this
 * site keeps for a mark: the `Sigil` and the `Seal` in components/editorial are
 * both a circle with a device set in it, and the bar already ends in one at the
 * other end, beside the wordmark (./index.tsx). Putting the reader's own two
 * letters in a ring gives the row a seal at each end, and gives a member the
 * same kind of object the site uses for itself.
 *
 * `size-8` and not a pixel figure, because everything inside the ring is in rem
 * — the letters, their tracking — and the root font is fluid down to 16px on a
 * phone (globals.css). A ring nailed to 32px would keep its size while its
 * contents shrank away from it; two rem shrinks with them, and the letters stay
 * at about two-fifths of the diameter at every width, which is roughly where a
 * struck seal puts its device.
 *
 * The 44px floor under the button is the fingertip target every link in the bar
 * keeps, and the ring sits centred in it. `rounded-full` on the button itself
 * paints nothing: it is there so the focus ring comes out as a capsule around
 * the seal rather than a rectangle cutting its corners off.
 *
 * Both the monogram and the stand-in below wear it, which is the point of it
 * being here rather than around the letters alone. Across the pre-paint swap the
 * ring never moves: what changes inside it is a sigil giving way to two letters,
 * and the reader is not shown one control being replaced by another.
 *
 * Lit, it does two things at once — on hover, on keyboard focus, and for as long
 * as the menu is open. The ring brightens and takes a gold halo, and the mark
 * warms to gold under a glow of its own, the bar's link treatment (`NavLink`,
 * the same three lines). Nothing new is drawn: a seal answering the cursor by
 * catching the light is the whole of it, where a second ring blooming outside
 * the first would have been the control gaining a part it does not have at rest.
 * `data-state` is Radix's, and without it the control would go dim the moment
 * the pointer left it for the panel — exactly when it should look held down.
 *
 * The name is `sr-only` at every width, since the menu names the reader in full
 * on its first row anyway. It stays in the markup because it is still the
 * button's accessible name and its visible-text match for speech input — the
 * mark itself is hidden from that, being two letters no one needs read out.
 *
 * The display class comes from the caller, as it does for every control in this
 * bar that the pre-paint script chooses between: this is rendered `hidden` in
 * that pass and `flex` after it, and a base `flex` would leave two rules of the
 * same property to be settled by the order Tailwind happened to emit them in.
 */
function MenuTrigger({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      className={`group text-muted-foreground hover:text-primary hover:text-shadow-glow focus-visible:text-primary focus-visible:outline-ring data-[state=open]:text-primary data-[state=open]:text-shadow-glow min-h-[44px] w-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[color,text-shadow] duration-300 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 ${className ?? ""}`}
      {...props}
    >
      {/* The wash is a gradient rather than a flat fill, and it is not part of
          the lit state: a gradient is a background image and its colour stops do
          not interpolate, so it would snap where the border and the glow fade.
          What it does at rest is give the ring a body, so the seal reads as
          struck out of something rather than drawn as an outline. */}
      <span
        aria-hidden="true"
        className="border-primary/40 from-primary/12 group-hover:border-primary/75 group-hover:shadow-glow-soft group-focus-visible:border-primary/75 group-focus-visible:shadow-glow-soft group-data-[state=open]:border-primary/75 group-data-[state=open]:shadow-glow-soft grid size-8 place-items-center rounded-full border bg-gradient-to-b to-transparent transition-[border-color,box-shadow] duration-300"
      >
        {children}
      </span>
      <span className="sr-only">{label}</span>
    </button>
  );
}

/**
 * A row of the menu, in the site's chrome rather than shadcn's: small caps in IM
 * Fell, square corners, and a light that comes up from the left edge.
 *
 * The lit state is three things at once, and each is doing a job shadcn's flat
 * `bg-accent` does not. A rule unrolls at the row's left edge — the vertical
 * echo of the gold hairline the whole site fences its bands with. A wash runs
 * off it and fades out before the right edge, so the surface reads as light
 * *from* the rule rather than a filled block. And the type warms and glows, the
 * way every link in the bar does. Together they are the difference between a
 * highlighted row and a lit one.
 *
 * `tone` is closed at two, because two is what the menu means: doors, and the
 * way out. Whole class sets per tone rather than overrides passed by the caller,
 * so a row's colours are decided here and cannot be half-replaced from outside.
 *
 * A component and not a shared class string — the rule from docs/ROADMAP.md, and
 * the reason is `asChild` below. A string would have to be threaded onto both a
 * `DropdownMenuItem` and an anchor and kept in step by hand; a component owns
 * the styling once and lets Radix hand it to whichever element the row turns out
 * to be.
 */
function MenuItem({
  tone = "gold",
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuItem> & { tone?: "gold" | "ember" }) {
  // `focus:`, not `hover:`. Radix moves real DOM focus onto the row under the
  // pointer, so this one state answers the mouse, the arrow keys and a screen
  // reader's cursor alike — and there is then no way for a hovered row and a
  // focused row to be two different rows, both lit.
  // The rule's colour is unconditional rather than part of the lit state: it is
  // invisible at rest anyway, scaled to nothing, and setting it only on focus
  // would have it flick back to the other tone's gold on the way out.
  const lit =
    tone === "gold"
      ? "before:bg-primary focus:text-primary-bright focus:text-shadow-glow-soft focus:from-primary/12"
      : "before:bg-ember focus:text-ember focus:from-ember/12";

  return (
    <DropdownMenuItem
      className={`font-caps text-label tracking-label text-muted-foreground cursor-pointer rounded-none px-4 py-[0.65rem] uppercase transition-[color,text-shadow] duration-300 select-none before:absolute before:inset-y-0 before:left-0 before:w-px before:origin-center before:scale-y-0 before:transition-transform before:duration-300 before:content-[''] focus:bg-transparent focus:bg-gradient-to-r focus:to-transparent focus:before:scale-y-100 ${lit} ${className ?? ""}`}
      {...props}
    />
  );
}

/** One of the four brackets inside the panel's border. A quarter of a frame:
 * two sides of a small square, positioned and oriented by the caller. */
function Corner({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`border-primary/50 pointer-events-none absolute size-[8px] ${className}`}
    />
  );
}

/** A row that navigates. `asChild` makes it a real anchor — middle-clickable,
 * copyable, and locale-resolving, since it is next-intl's `Link` — rather than a
 * div that calls the router. */
function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <MenuItem asChild>
      <Link href={href}>{children}</Link>
    </MenuItem>
  );
}

/**
 * The reader's mark: their two initials, cut for the ring above.
 *
 * Set in the body face, which looks like the odd choice in a bar of IM Fell and
 * Cinzel and is the only defensible one. Both of those are Latin-only at the
 * source — the note in app/[locale]/layout.tsx says so, and Cormorant Garamond
 * is the one face here that ships a Cyrillic subset. Every other label in this
 * bar is ours and can be written in an alphabet the display faces have; these
 * two letters are the reader's, and on a Ukrainian site they are usually
 * Cyrillic. In Cinzel they would silently become whatever serif the browser
 * keeps for the fallback, which is to say a different typeface per machine, in
 * the one place on the page where the letters belong to a person. Cormorant
 * draws them itself, in both alphabets, and it is already the face this site
 * sets everything a reader wrote in.
 *
 * Weight 500 rather than the 400 the page runs at, because Cormorant is a
 * high-contrast Garamond and at this size its capitals thin out to something
 * closer to a hairline than to the struck letters this wants to be. The variable
 * axis is loaded, so it costs no second file.
 *
 * A step down from the `text-label` the bar's links run at, which is a question
 * of what fits in a circle. A ring is at its widest exactly on the line the
 * letters sit on, so the pair gets the diameter and not a pixel more, and a wide
 * Cyrillic pair takes most of it — Ш and Ж are each the better part of an em
 * where В and С are around six-tenths. One size down keeps the worst pair off
 * the curve without leaving a common one adrift in the middle of it.
 *
 * `uppercase` guards the one case where the letters would not already be
 * capitals — a name saved lowercase — and the tracking is trimmed back out of
 * the right margin, so what is centred in the ring is the ink rather than the
 * ink plus a trailing letter-space (the same correction the role line makes
 * between its two sparks).
 *
 * `Array.from` and not `[0]`, so a name beginning with a character outside the
 * basic plane is not cut in half.
 */
function Monogram({ user }: { user: User }) {
  return (
    <span className="font-body text-caption -mr-[0.06em] leading-none font-medium tracking-[0.06em] uppercase">
      {Array.from(user.name)[0] ?? ""}
      {Array.from(user.surname)[0] ?? ""}
    </span>
  );
}
