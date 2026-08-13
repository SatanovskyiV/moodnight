import { useTranslations } from "next-intl";

import { Divider } from "@/components/editorial/divider";
import { Feed } from "@/components/feed";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

import { Welcome } from "./welcome";

/**
 * The front page: a masthead, and then the feed.
 *
 * The feed is the same for everybody — a visitor and a member are shown the
 * identical column of poems, because nothing on a published poem depends on who
 * is reading it. The masthead is the only half that knows, and `Welcome` is what
 * decides: the wordmark and the site's own line for a stranger, the greeting for
 * somebody the night recognised.
 *
 * That split is deliberate and it is what keeps the page cheap. Everything above
 * stays a Server Component: the anonymous masthead is *passed* to `Welcome` as
 * children rather than rendered by it, so it is built at deploy time, ships as
 * HTML, and costs the client bundle nothing but a reference. See the long note
 * on ./welcome.tsx for how the three-way swap avoids a flash on the way in.
 *
 * What used to be here — a "Phase 1" eyebrow and a row of colour swatches — was
 * a proof that the theme compiled, addressed to us. This page is addressed to
 * readers now, so it says what the site is instead.
 */
export default async function Home(props: LocaleParams) {
  await resolveLocale(props);

  // The content is split out because `useTranslations` is a hook and this
  // component has to be async to await the params.
  return <HomeContent />;
}

function HomeContent() {
  const t = useTranslations("home");

  return (
    // `max-w-page`, the wider of the two column tokens: a feed is an editorial
    // grid and not a single column of verse. The poem *inside* each card still
    // sets at reading width, which is the card's own business.
    //
    // `relative z-10` because body::before and body::after are fixed overlays at
    // z-index 1 and 2 — the noise and the vignette — and everything readable has
    // to sit above them.
    <main className="max-w-page compact:gap-20 compact:px-8 compact:py-24 relative z-10 mx-auto flex flex-col gap-14 px-6 py-16">
      {/* Centred, because the greeting `Welcome` swaps in is — and a masthead
          that moved to the left the moment a reader signed in would read as the
          page rearranging itself around them. */}
      <div className="max-w-reading compact:gap-8 mx-auto flex w-full flex-col items-center gap-6 text-center">
        <Welcome>
          <h1 className="font-display text-foreground tracking-display text-[clamp(2rem,9vw,3rem)] leading-tight uppercase">
            {t("title")}
          </h1>

          <p className="text-muted-foreground compact:text-xl text-lg text-balance italic">
            {t("tagline")}
          </p>
        </Welcome>

        {/* The way in to writing, and the one control on this page that is the
            same for everybody.

            It deliberately does not ask who is reading. `Welcome` above knows,
            and `Feed` below documents why it never asks — a button that branched
            on a session would be a third place waiting on `/auth/refresh`, and
            it would put this whole column into the client bundle to save a
            stranger one click. Instead the link is always here and the studio's
            own door answers it: a visitor who follows it meets the panel in
            components/session/gate.tsx, which offers `/sign-in` and sends them
            back to the page they were reaching for. Nothing here stops being
            statically prerendered. */}
        <Button asChild className="compact:px-8 mt-2 px-5 whitespace-normal">
          <Link href="/studio/poems/new">{t("write")}</Link>
        </Button>
      </div>

      <Divider />

      <Feed />
    </main>
  );
}
