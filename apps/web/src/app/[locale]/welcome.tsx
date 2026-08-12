"use client";

import type { User } from "@moodnight/shared";
import { useTranslations } from "next-intl";

import { FlourishLeft, FlourishRight, Seal, Spark } from "@/components/editorial/ornaments";
import { useSession, useSessionHint } from "@/components/session";
import { Restoring } from "@/components/session/gate";

/**
 * The home page's masthead, in the one version of it that knows who is reading.
 *
 * It is the whole of what the front page personalises, and that is by design:
 * the feed below is identical for a visitor and a member, because nothing on a
 * published poem depends on who opened it. Keeping the branch here means the
 * poems never wait on `/auth/refresh` to appear.
 *
 * It takes the anonymous block as `children` rather than rendering it, which is
 * what keeps the read path static. The page is prerendered at build time for
 * every visitor, so the markup a stranger sees is built on the server, ships as
 * HTML, and costs this client bundle nothing but the reference to it. Only the
 * two states that cannot exist before the browser has spoken to the API — the
 * waiting and the greeting — are JavaScript. The wait itself belongs to
 * components/session/gate.tsx, which shows the same rite at the door of
 * `/studio` and `/admin`: it is one wait for one question, asked here and there.
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
  // Its own namespace, because the rail and the user menu name the same four
  // roles and none of them is the home page's greeting.
  const role = useTranslations("roles");

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
          {role(user.role)}
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
