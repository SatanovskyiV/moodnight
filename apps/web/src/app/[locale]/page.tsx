import { useTranslations } from "next-intl";

import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

import { Welcome } from "./welcome";

/**
 * Placeholder. The prototype port (hero, poem cards, dividers, embers, footer,
 * auth card) replaces this — see docs/ROADMAP.md, Phase 1 step 2. The top bar is
 * already real and lives in the layout.
 *
 * The one part that is not a placeholder for a stranger is what a member sees:
 * `Welcome` swaps everything below for a greeting once the session has been
 * restored — the swatches included, because a proof that the theme compiles is
 * addressed to us and not to somebody who came here to read poetry. Everything
 * here stays a Server Component either way; see the note on that file for why
 * the anonymous copy is passed to it rather than rendered by it.
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
    <main className="max-w-reading compact:gap-8 compact:px-8 compact:py-24 relative z-10 mx-auto flex min-h-dvh flex-col justify-center gap-6 px-6 py-16">
      <Welcome>
        <p className="font-caps text-primary text-label tracking-eyebrow uppercase">{t("phase")}</p>

        {/* Fluid rather than stepped, and the only heading on the site that has
            to be: "MoodNight" is one unbreakable word, so a size that does not
            fit cannot wrap its way out of trouble — it just runs off the side.
            At 3rem with 0.18em of tracking that word is around 430px wide, which
            no phone has. The clamp tracks the viewport from about 360px to about
            600px and holds the prototype's size for everything above that. */}
        <h1 className="font-display text-foreground tracking-display text-[clamp(2rem,9vw,3rem)] leading-tight uppercase">
          {t("title")}
        </h1>

        <p className="text-muted-foreground compact:text-xl text-lg">{t("tagline")}</p>

        <div className="border-border flex flex-wrap gap-3 border-t pt-8">
          {(
            [
              ["bg-background", "background"],
              ["bg-card", "card"],
              ["bg-secondary", "secondary"],
              ["bg-primary", "primary"],
              ["bg-ember", "ember"],
              ["bg-destructive", "destructive"],
            ] as const
          ).map(([className, label]) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div className={`border-border size-12 border ${className}`} />
              {/* Token names, not prose — deliberately untranslated. */}
              <span className="text-parchment-faint text-micro tracking-widest uppercase">
                {label}
              </span>
            </div>
          ))}
        </div>
      </Welcome>
    </main>
  );
}
