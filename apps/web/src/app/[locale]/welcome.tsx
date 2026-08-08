"use client";

import type { User } from "@moodnight/shared";
import { useTranslations } from "next-intl";

import { FlourishLeft, FlourishRight, Seal } from "@/components/editorial/ornaments";
import { useSession } from "@/components/session";

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
 * greeting — the part that cannot exist before the browser has restored a
 * session — is JavaScript.
 *
 * A signed-in reader therefore sees the anonymous block for the moment
 * `/auth/refresh` is in flight, and the greeting fades in after it. The bar's
 * auth control goes to some length to avoid exactly that flicker, and this
 * deliberately does not: the control has a pre-paint answer available to it (a
 * flag in storage says *whether* somebody is signed in), while nothing on this
 * origin can know *who* until the API says so. A skeleton in the meantime would
 * replace a correct hero with a placeholder, which is the worse trade.
 */
export function Welcome({ children }: { children: React.ReactNode }) {
  const { state } = useSession();

  return state.status === "signedIn" ? <Greeting user={state.session.user} /> : children;
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
function Spark() {
  return (
    <span
      aria-hidden="true"
      className="bg-primary size-[4px] shrink-0 rotate-45 shadow-[0_0_8px_var(--accent-gold)]"
    />
  );
}
