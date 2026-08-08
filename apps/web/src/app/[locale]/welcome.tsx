"use client";

import type { User } from "@moodnight/shared";
import { useTranslations } from "next-intl";

import { FlourishLeft, FlourishRight, Seal } from "@/components/editorial/ornaments";
import { useSession, useSessionHint } from "@/components/session";

/**
 * The home page's opening block, in the one version of it that knows who is
 * reading.
 *
 * Temporary, and deliberately so: until Phase 2 gives this page a feed to show,
 * the only thing a member can be told is that the night recognised them. What
 * replaces this is a real hero (docs/ROADMAP.md, "Design system"); what should
 * survive it is the greeting below, moved wherever the hero leaves room.
 *
 * It takes the anonymous block as `children` rather than rendering it, which is
 * what keeps the read path static. The page is prerendered at build time for
 * every visitor, so the markup a stranger sees is built on the server, ships as
 * HTML, and costs this client bundle nothing but the reference to it. Only the
 * two states that cannot exist before the browser has spoken to the API — the
 * waiting and the greeting — are JavaScript.
 *
 * There are three renders here rather than two, and the third is the whole
 * reason this reads calmly. Nothing on this origin can know *who* is reading
 * until `/auth/refresh` answers, but the hint in storage does say *whether*
 * somebody is — so a returning member is not shown a page addressed to a
 * stranger while the request is in flight; they are shown the candles being
 * relit. What makes it flicker-free is that the choice is not made here at all
 * on the first pass: as with the bar's auth control, both blocks are emitted and
 * CSS shows the one the pre-paint script chose, keyed off `data-session` on
 * `<html>`. The swap therefore happens before the first paint, without this
 * bundle having arrived.
 *
 * Hence `useSessionHint` beside `useSession`: `unknown` is a fact about this
 * render — storage has not been consulted — and not a fourth kind of reader. Its
 * two `data-session` variants are written out in full because Tailwind finds
 * classes by scanning for whole strings; see the same note in
 * components/top-nav/auth-action.tsx and components/session/hint.ts.
 */
export function Welcome({ children }: { children: React.ReactNode }) {
  const hint = useSessionHint();
  const { state } = useSession();

  if (hint === "unknown") {
    return (
      <>
        {/* `contents` so the wrapper is not a box: the anonymous block's
            elements go on being direct children of the page's flex column, with
            its gaps, exactly as they are once this wrapper is gone. Both rules
            here are `display`, and the attribute selector is what settles them —
            it outranks the plain class whichever order Tailwind emits them in. */}
        <div className="contents [[data-session=restoring]_&]:hidden">{children}</div>
        <Restoring className="hidden [[data-session=restoring]_&]:flex" />
      </>
    );
  }

  if (state.status === "signedIn") {
    return <Greeting user={state.session.user} />;
  }

  if (state.status === "restoring") {
    return <Restoring className="flex" />;
  }

  return children;
}

/**
 * The wait, dressed as a rite rather than a spinner: the seal turning once every
 * twelve seconds over a breathing pool of gold, and a line saying what is being
 * waited for.
 *
 * It reserves roughly the greeting's height so that arriving at the greeting is
 * a fade and not a jolt of everything below it. Exactly matching is not worth
 * chasing — a name is as tall as it is — and the page centres its column, so
 * what is left of the difference is shared between top and bottom.
 *
 * The display class comes from the caller and is deliberately absent here: this
 * is rendered `hidden` in the pre-paint pass and `flex` after it, and a base
 * `flex` would leave two rules of the same property to be settled by the order
 * Tailwind happened to emit them in.
 */
function Restoring({ className }: { className?: string }) {
  const t = useTranslations("home.welcome");

  return (
    <section
      // The wait is announced, the greeting is not: a reader who cannot see the
      // seal turning still learns that something is happening, and `polite`
      // means it waits its turn rather than interrupting.
      aria-live="polite"
      aria-busy="true"
      className={`compact:min-h-[20rem] min-h-[16rem] flex-col items-center justify-center gap-8 text-center ${className ?? ""}`}
    >
      <span className="text-primary/60 drop-shadow-glow compact:size-20 relative grid size-16 place-items-center">
        <span
          aria-hidden="true"
          className="bg-primary/10 absolute inset-[-25%] rounded-full blur-2xl motion-safe:animate-pulse"
        />
        {/* Twelve seconds a turn. `animate-spin`'s own second would be a loading
            spinner; at this speed a heraldic seal is barely moving, which is the
            difference between waiting and being made to wait. */}
        <Seal className="relative size-full [animation-duration:12s] motion-safe:animate-spin" />
      </span>

      <p className="font-caps text-primary/70 text-label tracking-eyebrow flex flex-col items-center gap-5 uppercase">
        <span className="-mr-[0.4em]">{t("restoring")}</span>

        {/* The ellipsis, in the site's own alphabet — three sparks lighting in
            turn. `motion-safe:` covers the stagger too: without it they simply
            sit there, lit, which is a full stop and not a broken animation. */}
        <span aria-hidden="true" className="flex items-center gap-3">
          <Spark className="motion-safe:animate-pulse" />
          <Spark className="[animation-delay:400ms] motion-safe:animate-pulse" />
          <Spark className="[animation-delay:800ms] motion-safe:animate-pulse" />
        </span>
      </p>
    </section>
  );
}

/**
 * Built from the prototype's hero (prototype/styles.css:354-414): the eyebrow
 * with its rotated sparks, the Cinzel title under a gold glow, the italic line
 * beneath. The seal is the auth card's, repeated on purpose — it is the glyph
 * that was above the form they signed in through, so meeting it again is the
 * site saying it remembers.
 *
 * `motion-safe:` on the entrance, because it is decoration and a reader who has
 * asked for stillness should simply find the greeting already there.
 */
function Greeting({ user }: { user: User }) {
  const t = useTranslations("home.welcome");

  return (
    <section className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 flex flex-col items-center gap-6 text-center duration-1000">
      <span className="text-primary drop-shadow-glow compact:size-20 relative grid size-16 place-items-center">
        {/* The candle behind the seal. `inset-[-25%]` so the blur has room to
            fall off outside the glyph rather than being cropped to its box, and
            a sibling rather than a `::before` so the pulse is one element's
            animation and not a second rule fighting `drop-shadow-glow`. */}
        <span
          aria-hidden="true"
          className="bg-primary/15 absolute inset-[-25%] rounded-full blur-2xl motion-safe:animate-pulse"
        />
        <Seal className="relative size-full" />
      </span>

      <p className="font-caps text-primary text-label tracking-eyebrow flex items-center gap-4 uppercase opacity-85">
        <Spark />
        {/* 0.4em of tracking is also 0.4em of empty space after the last letter,
            which would push the label off-centre between its two sparks. Pulling
            the gap back by exactly that much is what makes the pair symmetrical. */}
        <span className="-mr-[0.4em]">{t("eyebrow")}</span>
        <Spark />
      </p>

      <div className="flex w-full items-center justify-center gap-5">
        {/* Below `narrow:` the flourishes would take the width the name needs,
            and the name is the point. */}
        <FlourishLeft className="text-primary-deep narrow:block hidden w-20 shrink" />

        {/* The page's one `h1` while it is on screen: the anonymous block's
            heading is the other half of this swap, so only ever one of them is
            in the document.

            `break-words` because this is the one heading on the site whose text
            is not ours — a long enough surname has to break rather than run off
            the side of a phone. */}
        <h1 className="font-display text-foreground tracking-display text-shadow-glow-soft text-[clamp(1.5rem,5.5vw,2.4rem)] leading-tight break-words uppercase">
          {user.name} <span className="text-primary">{user.surname}</span>
        </h1>

        <FlourishRight className="text-primary-deep narrow:block hidden w-20 shrink" />
      </div>

      <p className="text-muted-foreground compact:text-xl max-w-[32rem] text-lg text-balance italic">
        {t("line")}
      </p>

      <div className="flex flex-col items-center gap-3">
        <span className="font-caps text-primary text-micro tracking-label border-primary/30 bg-primary/5 border px-4 py-2 uppercase">
          {t(`roles.${user.role}`)}
        </span>

        {/* The account's own date, formatted by the catalogue's ICU placeholder
            rather than here — "9 серпня 2026 р." and "9 August 2026" are one
            message with one argument, and the difference belongs to the locale. */}
        <span className="text-parchment-faint text-caption italic">
          {t("since", { date: new Date(user.createdAt) })}
        </span>
      </div>
    </section>
  );
}

/** The prototype's `.hero-eyebrow .dot` (styles.css:375-381) — a lit square, turned. */
function Spark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`bg-primary size-[4px] shrink-0 rotate-45 shadow-[0_0_8px_var(--accent-gold)] ${className ?? ""}`}
    />
  );
}
